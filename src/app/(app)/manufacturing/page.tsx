import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { PartStatus } from '@/lib/types';
import ManufacturingQueue from './ManufacturingQueue';

const MFG_STATUSES: PartStatus[] = [
  'ready_for_manufacturing',
  'in_progress',
  'manufacturing_complete',
];

export default async function ManufacturingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; assembly?: string }>;
}) {
  const filters = await searchParams;
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
  let projectAssembliesForFilter: Array<{ id: string; assembly_number: string; name: string }> = [];
  if (activeCode) {
    const { data: projectAssemblies } = await supabase
      .from('assemblies')
      .select('id, assembly_number, name')
      .eq('team_id', teamId)
      .gte('assembly_number', `${activeCode}_`)
      .lt('assembly_number', activeCode + '\x60')
      .order('assembly_number');
    projectAssemblyIds = (projectAssemblies ?? []).map((a) => a.id);
    projectAssembliesForFilter = projectAssemblies ?? [];
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

  if (filters.assembly) {
    partsQuery = partsQuery.eq('assembly_id', filters.assembly);
  } else if (projectAssemblyIds !== null) {
    const ids = projectAssemblyIds.length > 0
      ? projectAssemblyIds
      : ['00000000-0000-0000-0000-000000000000'];
    partsQuery = partsQuery.in('assembly_id', ids);
  }

  if (filters.q) {
    const q = filters.q.trim();
    partsQuery = partsQuery.or(`name.ilike.%${q}%,part_number.ilike.%${q}%`);
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

      {/* Search & Assembly filter */}
      <form method="GET" action="/manufacturing" className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            name="q"
            defaultValue={filters.q ?? ''}
            placeholder="Search by name or part no…"
            className="pl-8 pr-3 py-2 w-56 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        {projectAssembliesForFilter.length > 0 && (
          <select
            name="assembly"
            defaultValue={filters.assembly ?? ''}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="">All Assemblies</option>
            {projectAssembliesForFilter.map((a) => (
              <option key={a.id} value={a.id}>
                {a.assembly_number} — {a.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-200 hover:bg-gray-600 transition-colors">
          Filter
        </button>
        {(filters.q || filters.assembly) && (
          <Link href="/manufacturing" className="px-3 py-2 text-sm text-gray-400 hover:text-gray-200">
            Clear
          </Link>
        )}
      </form>

      <ManufacturingQueue parts={parts} canMutate={canMutate} />
    </div>
  );
}
