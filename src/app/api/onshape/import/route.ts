import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBom } from '@/lib/onshape/client';
import { processBomItems, dedupeBomItems } from '@/lib/onshape/bom';
import { checkNamingConformance, nextPartNumber, nextSubAssemblyNumber } from '@/lib/validation';

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, role, active_project_code')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json({ error: 'No active team' }, { status: 400 });
  if (profile.role === 'viewer') return NextResponse.json({ error: 'Viewers cannot import' }, { status: 403 });

  let assemblyId: string;
  try {
    const body = await request.json();
    assemblyId = body.assemblyId;
    if (!assemblyId) throw new Error('assemblyId required');
  } catch {
    return NextResponse.json({ error: 'assemblyId is required' }, { status: 400 });
  }

  // Fetch assembly
  const { data: assembly } = await supabase
    .from('assemblies')
    .select('id, assembly_number, team_id, onshape_doc_id, onshape_workspace_id, onshape_element_id')
    .eq('id', assemblyId)
    .eq('team_id', profile.team_id)
    .single();

  if (!assembly) return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
  if (!assembly.onshape_doc_id || !assembly.onshape_workspace_id || !assembly.onshape_element_id) {
    return NextResponse.json({ error: 'Assembly not linked to OnShape' }, { status: 400 });
  }

  const cacheKey = `${assembly.onshape_doc_id}/${assembly.onshape_workspace_id}/${assembly.onshape_element_id}`;

  // Try BOM cache
  let bomData: Awaited<ReturnType<typeof fetchBom>> | null = null;
  const { data: cached } = await supabase
    .from('onshape_bom_cache')
    .select('bom_json, fetched_at')
    .eq('team_id', profile.team_id)
    .eq('cache_key', cacheKey)
    .single();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    bomData = cached.bom_json as typeof bomData;
  } else {
    const { data: creds } = await supabase.rpc('get_onshape_credentials', {
      p_team_id: profile.team_id,
    });
    if (!creds) return NextResponse.json({ error: 'OnShape credentials not configured' }, { status: 400 });

    try {
      bomData = await fetchBom(
        {
          documentId:    assembly.onshape_doc_id,
          workspaceType: 'w',
          workspaceId:   assembly.onshape_workspace_id,
          elementId:     assembly.onshape_element_id,
        },
        { accessKey: creds.access_key, secretKey: creds.secret_key },
      );
      await supabase.from('onshape_bom_cache').upsert({
        team_id:    profile.team_id,
        cache_key:  cacheKey,
        bom_json:   bomData,
        fetched_at: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  const items = dedupeBomItems(processBomItems(bomData!.bomTable.items));

  // Fetch existing parts and assemblies for this assembly (to check for duplicates)
  const { data: existingParts } = await supabase
    .from('parts')
    .select('id, part_number, onshape_part_id, onshape_element_id, onshape_workspace_id')
    .eq('assembly_id', assemblyId);

  const { data: allTeamParts } = await supabase
    .from('parts')
    .select('part_number')
    .eq('team_id', profile.team_id);

  const { data: allTeamAssemblies } = await supabase
    .from('assemblies')
    .select('assembly_number, onshape_doc_id, onshape_element_id')
    .eq('team_id', profile.team_id);

  const existingPartNums = allTeamParts?.map((p) => p.part_number).filter(Boolean) as string[];
  const existingAsmNums = allTeamAssemblies?.map((a) => a.assembly_number) as string[];
  const projectCode = profile.active_project_code ?? assembly.assembly_number.slice(0, 2);

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const item of items) {
    const onshapeKey = `${item.documentId}/${item.elementId}/${item.partId ?? '__asm__'}`;

    if (item.itemType === 'PART') {
      // Check if part already exists by OnShape IDs
      const existing = existingParts?.find(
        (p) =>
          p.onshape_element_id === item.elementId &&
          p.onshape_part_id    === (item.partId ?? null),
      );

      if (existing) {
        // Update BOM quantity
        await supabase
          .from('bom_items')
          .update({ onshape_quantity: item.quantity })
          .eq('part_id', existing.id);
        updated.push(item.name);
      } else {
        // Generate part number
        const partNum = nextPartNumber(assembly.assembly_number, existingPartNums);
        existingPartNums.push(partNum);

        const conformance = checkNamingConformance(item.name, 'part');

        const { data: newPart, error: partError } = await supabase
          .from('parts')
          .insert({
            name:                  item.name,
            part_number:           item.type === 'manufactured' ? partNum : null,
            assembly_id:           assemblyId,
            team_id:               profile.team_id,
            type:                  item.type,
            status:                'design',
            naming_flagged:        !conformance.conforms,
            created_by:            user.id,
            onshape_part_id:       item.partId,
            onshape_element_id:    item.elementId,
            onshape_workspace_id:  item.workspaceId,
          })
          .select('id')
          .single();

        if (partError || !newPart) {
          skipped.push(`${item.name} (${partError?.message ?? 'insert failed'})`);
          continue;
        }

        await supabase.from('bom_items').insert({
          assembly_id:    assemblyId,
          part_id:        newPart.id,
          onshape_quantity: item.quantity,
          cots_quantity:  item.type === 'off_shelf' ? item.quantity : null,
          cots_quantity_spare: 0,
        });

        await supabase.from('part_status_history').insert({
          part_id:    newPart.id,
          status:     'design',
          changed_by: user.id,
        });

        created.push(item.name);
      }
    } else if (item.itemType === 'ASSEMBLY') {
      // Check if sub-assembly already linked by OnShape element ID
      const existingAsm = allTeamAssemblies?.find(
        (a) => a.onshape_element_id === item.elementId,
      );

      if (existingAsm) {
        skipped.push(`${item.name} (sub-assembly already exists)`);
      } else {
        // Create sub-assembly with auto-number
        const asmNum = nextSubAssemblyNumber(assembly.assembly_number, existingAsmNums);
        existingAsmNums.push(asmNum);

        await supabase.from('assemblies').insert({
          assembly_number:      asmNum,
          name:                 item.name,
          team_id:              profile.team_id,
          parent_assembly_id:   assemblyId,
          created_by:           user.id,
          onshape_doc_id:       item.documentId,
          onshape_workspace_id: item.workspaceId,
          onshape_element_id:   item.elementId,
        });

        created.push(`${item.name} (assembly)`);
      }
    }
  }

  // Record sync time
  await supabase
    .from('assemblies')
    .update({ onshape_last_sync: new Date().toISOString() })
    .eq('id', assemblyId);

  return NextResponse.json({
    success: true,
    created: created.length,
    updated: updated.length,
    skipped: skipped.length,
    details: { created, updated, skipped },
  });
}
