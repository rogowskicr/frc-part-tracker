import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { nextPartNumber, checkNamingConformance } from '@/lib/validation';

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json({ error: 'No active team' }, { status: 400 });
  if (profile.role === 'viewer') return NextResponse.json({ error: 'Viewers cannot apply sync' }, { status: 403 });

  let diffId: string;
  try {
    const body = await request.json();
    diffId = body.diffId;
    if (!diffId) throw new Error();
  } catch {
    return NextResponse.json({ error: 'diffId is required' }, { status: 400 });
  }

  const { data: diff } = await supabase
    .from('onshape_sync_diffs')
    .select('*')
    .eq('id', diffId)
    .eq('team_id', profile.team_id)
    .single();

  if (!diff) return NextResponse.json({ error: 'Diff not found' }, { status: 404 });
  if (diff.applied) return NextResponse.json({ error: 'Diff already applied' }, { status: 400 });

  const assemblyId: string = diff.assembly_id;

  const { data: assembly } = await supabase
    .from('assemblies')
    .select('assembly_number')
    .eq('id', assemblyId)
    .single();

  if (!assembly) return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });

  const { data: allTeamParts } = await supabase
    .from('parts')
    .select('part_number')
    .eq('team_id', profile.team_id);

  const existingPartNums = allTeamParts?.map((p) => p.part_number).filter(Boolean) as string[];

  type AddedItem   = { name: string; quantity: number; type: string };
  type ChangedItem = { name: string; partId: string; oldQty: number; newQty: number };
  type RemovedItem = { name: string; partId: string };

  const added   = (diff.added_parts   as AddedItem[])   ?? [];
  const changed = (diff.changed_parts as ChangedItem[]) ?? [];
  const removed = (diff.removed_parts as RemovedItem[]) ?? [];

  // Apply additions
  for (const item of added) {
    const partNum = item.type === 'manufactured'
      ? nextPartNumber(assembly.assembly_number, existingPartNums)
      : null;
    if (partNum) existingPartNums.push(partNum);

    const conformance = checkNamingConformance(item.name, 'part');

    const { data: newPart } = await supabase
      .from('parts')
      .insert({
        name:          item.name,
        part_number:   partNum,
        assembly_id:   assemblyId,
        team_id:       profile.team_id,
        type:          item.type,
        status:        'design',
        naming_flagged: !conformance.conforms,
        created_by:    user.id,
      })
      .select('id')
      .single();

    if (newPart) {
      await supabase.from('bom_items').insert({
        assembly_id:         assemblyId,
        part_id:             newPart.id,
        onshape_quantity:    item.quantity,
        cots_quantity:       item.type === 'off_shelf' ? item.quantity : null,
        cots_quantity_spare: 0,
      });
      await supabase.from('part_status_history').insert({
        part_id:    newPart.id,
        status:     'design',
        changed_by: user.id,
      });
    }
  }

  // Apply quantity changes
  for (const item of changed) {
    await supabase
      .from('bom_items')
      .update({ onshape_quantity: item.newQty })
      .eq('part_id', item.partId);
  }

  // Mark removed parts as on_hold with a status history note
  for (const item of removed) {
    await supabase.from('parts').update({ status: 'on_hold' }).eq('id', item.partId);
    await supabase.from('part_status_history').insert({
      part_id:    item.partId,
      status:     'on_hold',
      changed_by: user.id,
      notes:      'Removed from OnShape BOM during sync',
    });
  }

  // Mark diff as applied and update assembly sync time
  await Promise.all([
    supabase
      .from('onshape_sync_diffs')
      .update({ applied: true, applied_at: new Date().toISOString() })
      .eq('id', diffId),
    supabase
      .from('assemblies')
      .update({ onshape_last_sync: new Date().toISOString() })
      .eq('id', assemblyId),
  ]);

  return NextResponse.json({
    success: true,
    added:   added.length,
    changed: changed.length,
    removed: removed.length,
  });
}
