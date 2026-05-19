import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { PartStatus } from '@/lib/types';
import ManufacturingQueue from './ManufacturingQueue';

const MFG_STATUSES: PartStatus[] = [
  'ready_for_manufacturing',
  'in_progress',
  'manufacturing_complete',
];

export default async function ManufacturingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, role, active_project_code')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) {
    return <div className="text-gray-400 py-8">No team assigned.</div>;
  }

  const teamId     = profile.team_id;
  const activeCode = profile.active_project_code ?? null;
  const canMutate  = profile.role !== 'viewer';

  // Scope to active project if set
  let projectAssemblyIds: string[] | null = null;
  if (activeCode) {
    const { data: projectAssemblies } = await supabase
      .from('assemblies')
      .select('id')
      .eq('team_id', teamId)
      .gte('assembly_number', `${activeCode}_`)
      .lt('assembly_number', activeCode + '\x60');
    projectAssemblyIds = (projectAssemblies ?? []).map((a) => a.id);
  }

  let partsQuery = supabase
    .from('parts')
    .select(`
      id, part_number, name, status, onshape_element_id, onshape_part_id,
      assembly:assembly_id(id, assembly_number, name),
      assigned_user:assigned_to(name),
      processes:part_manufacturing(id, process:process_id(id, name))
    `)
    .eq('team_id', teamId)
    .eq('type', 'manufactured')
    .in('status', MFG_STATUSES)
    .order('updated_at', { ascending: false });

  if (projectAssemblyIds !== null) {
    const ids = projectAssemblyIds.length > 0
      ? projectAssemblyIds
      : ['00000000-0000-0000-0000-000000000000'];
    partsQuery = partsQuery.in('assembly_id', ids);
  }

  const { data: rawParts } = await partsQuery;

  const parts = (rawParts ?? []).map((p) => ({
    id: p.id,
    part_number: p.part_number,
    name: p.name,
    status: p.status as PartStatus,
    onshape_element_id: p.onshape_element_id,
    onshape_part_id: p.onshape_part_id,
    assembly: p.assembly as unknown as { id: string; assembly_number: string; name: string } | null,
    assigned_user: p.assigned_user as unknown as { name: string } | null,
    processes: (p.processes as unknown as Array<{
      id: string;
      process: { id: string; name: string } | null;
    }>) ?? [],
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Manufacturing</h1>
        <p className="text-gray-400 mt-1">
          {parts.length} part{parts.length !== 1 ? 's' : ''} in queue
          {activeCode ? ` · Project ${activeCode}` : ''}
        </p>
      </div>

      {!activeCode && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-900/20 border border-amber-700/50">
          <span className="text-amber-400 text-lg shrink-0">⚠</span>
          <p className="text-sm text-amber-300">
            No active project selected — showing parts from all projects.
            Select a project from the Team page to narrow the view.
          </p>
        </div>
      )}

      <ManufacturingQueue parts={parts} canMutate={canMutate} />
    </div>
  );
}
