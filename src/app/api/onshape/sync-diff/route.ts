import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBom } from '@/lib/onshape/client';
import { processBomItems, dedupeBomItems, bomItemKey } from '@/lib/onshape/bom';

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json({ error: 'No active team' }, { status: 400 });

  const assemblyId = new URL(request.url).searchParams.get('assemblyId');
  if (!assemblyId) return NextResponse.json({ error: 'assemblyId required' }, { status: 400 });

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

  // Fetch live BOM (or use cache)
  let bomData: Awaited<ReturnType<typeof fetchBom>>;
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

  const onshapeItems = dedupeBomItems(processBomItems(bomData.bomTable.items));
  const onshapeByKey = new Map(onshapeItems.map((i) => [bomItemKey(i), i]));

  // Fetch current DB parts
  const { data: dbParts } = await supabase
    .from('parts')
    .select('id, name, onshape_part_id, onshape_element_id, onshape_workspace_id, bom_items(onshape_quantity)')
    .eq('assembly_id', assemblyId);

  type DbPart = NonNullable<typeof dbParts>[number];

  const dbByKey = new Map<string, DbPart>();
  for (const p of dbParts ?? []) {
    if (p.onshape_element_id && p.onshape_part_id) {
      const key = `${assembly.onshape_doc_id}/${p.onshape_element_id}/${p.onshape_part_id}`;
      dbByKey.set(key, p);
    }
  }

  const added: { name: string; quantity: number; type: string }[] = [];
  const removed: { name: string; partId: string }[] = [];
  const changed: { name: string; partId: string; oldQty: number; newQty: number }[] = [];

  // Parts in OnShape but not in DB → added
  for (const [key, item] of onshapeByKey) {
    if (!dbByKey.has(key)) {
      added.push({ name: item.name, quantity: item.quantity, type: item.type });
    } else {
      const dbPart = dbByKey.get(key)!;
      const bom = (dbPart.bom_items as Array<{ onshape_quantity: number }>)?.[0];
      const oldQty = bom?.onshape_quantity ?? 0;
      if (oldQty !== item.quantity) {
        changed.push({ name: item.name, partId: dbPart.id, oldQty, newQty: item.quantity });
      }
    }
  }

  // Parts in DB that came from OnShape but are no longer in BOM → removed
  for (const [key, dbPart] of dbByKey) {
    if (!onshapeByKey.has(key)) {
      removed.push({ name: dbPart.name, partId: dbPart.id });
    }
  }

  // Persist diff for apply step
  const { data: diff } = await supabase
    .from('onshape_sync_diffs')
    .insert({
      team_id:       profile.team_id,
      assembly_id:   assemblyId,
      added_parts:   added,
      removed_parts: removed,
      changed_parts: changed,
    })
    .select('id')
    .single();

  return NextResponse.json({
    diffId: diff?.id,
    added,
    removed,
    changed,
    noChanges: added.length === 0 && removed.length === 0 && changed.length === 0,
  });
}
