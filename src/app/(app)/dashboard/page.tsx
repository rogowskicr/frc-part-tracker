import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import TeamsPanel from '@/components/TeamsPanel';
import type { PartStatus } from '@/lib/types';
import type { TeamMembership } from '@/components/TeamsPanel';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, name, role, active_project_code')
    .eq('id', user.id)
    .single();


  const { data: membershipsRaw } = await supabase
    .from('team_memberships')
    .select('role, team_id, teams(id, name, join_code)')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true });

  const memberships: TeamMembership[] = (membershipsRaw ?? []).map((m) => {
    const t = m.teams as unknown as { id: string; name: string; join_code: string };
    return { teamId: t.id, teamName: t.name, joinCode: t.join_code, role: m.role };
  });

  if (!profile?.team_id) {
    return (
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          {profile?.name && (
            <p className="text-gray-400 mt-1">Welcome, {profile.name}</p>
          )}
        </div>
        <TeamsPanel activeTeamId={null} memberships={memberships} />
      </div>
    );
  }

  const teamId      = profile.team_id;
  const activeCode  = profile.active_project_code ?? null;

  // Check whether the team has any projects at all
  const { count: projectCount } = await supabase
    .from('team_projects')
    .select('year', { count: 'exact', head: true })
    .eq('team_id', teamId);

  const hasProjects = (projectCount ?? 0) > 0;

  // When a project is active, pre-fetch assembly IDs scoped to that project prefix
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

  // Assembly count query
  let assemblyCountQuery = supabase
    .from('assemblies')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (activeCode) {
    assemblyCountQuery = assemblyCountQuery
      .gte('assembly_number', `${activeCode}_`)
      .lt('assembly_number', activeCode + '\x60');
  }

  // Parts queries
  let partsQuery = supabase
    .from('parts')
    .select('id, status', { count: 'exact' })
    .eq('team_id', teamId);
  let myPartsQuery = supabase
    .from('parts')
    .select('id, part_number, name, status, assembly_id, assemblies(assembly_number, name)')
    .eq('team_id', teamId)
    .eq('assigned_to', user.id)
    .neq('status', 'complete')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (projectAssemblyIds !== null) {
    const ids = projectAssemblyIds.length > 0
      ? projectAssemblyIds
      : ['00000000-0000-0000-0000-000000000000'];
    partsQuery   = partsQuery.in('assembly_id', ids);
    myPartsQuery = myPartsQuery.in('assembly_id', ids);
  }

  const [assembliesRes, partsRes, myPartsRes] = await Promise.all([
    assemblyCountQuery,
    partsQuery,
    myPartsQuery,
  ]);

  const totalAssemblies = assembliesRes.count ?? 0;
  const allParts        = partsRes.data ?? [];
  const totalParts      = partsRes.count ?? 0;
  const myParts         = myPartsRes.data ?? [];

  const statusCounts = allParts.reduce(
    (acc, part) => {
      acc[part.status as PartStatus] = (acc[part.status as PartStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<PartStatus, number>
  );

  const statuses: PartStatus[] = [
    'design',
    'ready_for_manufacturing',
    'in_progress',
    'complete',
    'on_hold',
  ];

  const noProjectMessage = !hasProjects
    ? 'No projects have been added yet. A team admin can add one from the Team page.'
    : 'Select a project from the Team page to start adding parts and assemblies.';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Welcome back, {profile.name} —{' '}
          <span className="text-amber-400 font-medium">Live long and prosper.</span>
        </p>
      </div>

      {/* No-project banner */}
      {!activeCode && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-900/20 border border-amber-700/50">
          <span className="text-amber-400 text-lg shrink-0">⚠</span>
          <div>
            <p className="text-sm font-medium text-amber-300">No active project</p>
            <p className="text-xs text-amber-200/70 mt-0.5">{noProjectMessage}</p>
          </div>
          <Link
            href={`/team/${teamId}`}
            className="ml-auto shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Go to Team
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label={activeCode ? `Assemblies (${activeCode})` : 'Assemblies'}
          value={activeCode ? totalAssemblies : null}
          href="/assemblies"
        />
        <StatCard
          label={activeCode ? `Parts (${activeCode})` : 'Total Parts'}
          value={activeCode ? totalParts : null}
          href="/parts"
        />
        <StatCard
          label="In Progress"
          value={activeCode ? (statusCounts['in_progress'] ?? 0) : null}
          href="/parts?status=in_progress"
        />
        <StatCard
          label="Complete"
          value={activeCode ? (statusCounts['complete'] ?? 0) : null}
          href="/parts?status=complete"
        />
      </div>

      {/* Status breakdown */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <h2 className="font-semibold text-gray-100 mb-4">Parts by Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {statuses.map((status) => (
            <Link
              key={status}
              href={`/parts?status=${status}`}
              className="flex flex-col items-center p-3 rounded-lg border border-gray-700 hover:bg-gray-700/50 transition-colors"
            >
              <span className="text-2xl font-bold text-gray-100">
                {activeCode ? (statusCounts[status] ?? 0) : 'N/A'}
              </span>
              <StatusBadge status={status} size="sm" />
            </Link>
          ))}
        </div>
      </div>

      {/* My assigned parts */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-100">My Assigned Parts</h2>
          <Link href="/parts?assigned=me" className="text-sm text-blue-400 hover:text-blue-300">
            View all
          </Link>
        </div>
        {myParts.length === 0 ? (
          <p className="text-gray-400 text-sm">No parts assigned to you.</p>
        ) : (
          <div className="divide-y divide-gray-700">
            {myParts.map((part) => {
              const assembly    = part.assemblies as unknown as { assembly_number: string; name: string } | null;
              return (
                <div key={part.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/parts/${part.id}`}
                      className="text-sm font-medium text-gray-100 hover:text-blue-400 truncate block"
                    >
                      {part.part_number && (
                        <span className="font-mono text-xs text-gray-400 mr-2">
                          {part.part_number}
                        </span>
                      )}
                      {part.name}
                    </Link>
                    {assembly && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {assembly.assembly_number} — {assembly.name}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={part.status as PartStatus} size="sm" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions — only when a project is active and user can mutate */}
      {activeCode && profile.role !== 'viewer' ? (
        <div className="flex gap-3">
          <Link
            href="/assemblies/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + New Assembly
          </Link>
          <Link
            href="/parts/new"
            className="px-4 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            + New Part
          </Link>
        </div>
      ) : (
        <div className="flex gap-3">
          <span
            title={!activeCode ? 'Select a project first' : 'Viewers cannot create assemblies'}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-600 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            + New Assembly
          </span>
          <span
            title={!activeCode ? 'Select a project first' : 'Viewers cannot create parts'}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-600 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            + New Part
          </span>
        </div>
      )}

      <TeamsPanel activeTeamId={teamId} memberships={memberships} />
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number | null; href: string }) {
  return (
    <Link
      href={href}
      className="bg-gray-800 rounded-xl border border-gray-700 p-5 hover:border-amber-500 transition-colors"
    >
      <p className="text-3xl font-bold text-gray-100">{value ?? 'N/A'}</p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
    </Link>
  );
}
