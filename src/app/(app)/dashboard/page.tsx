import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import type { PartStatus } from '@/lib/types';
import { PART_STATUS_LABELS } from '@/lib/types';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, name, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-600">You are not assigned to a team yet.</p>
      </div>
    );
  }

  const teamId = profile.team_id;

  // Fetch stats in parallel
  const [assembliesRes, partsRes, myPartsRes] = await Promise.all([
    supabase.from('assemblies').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    supabase.from('parts').select('id, status', { count: 'exact' }).eq('team_id', teamId),
    supabase
      .from('parts')
      .select('id, part_number, name, status, assembly_id, assemblies(assembly_number, name)')
      .eq('team_id', teamId)
      .eq('assigned_to', user.id)
      .neq('status', 'complete')
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);

  const totalAssemblies = assembliesRes.count ?? 0;
  const allParts = partsRes.data ?? [];
  const totalParts = partsRes.count ?? 0;
  const myParts = myPartsRes.data ?? [];

  // Count parts by status
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back, {profile.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Assemblies" value={totalAssemblies} href="/assemblies" />
        <StatCard label="Total Parts" value={totalParts} href="/parts" />
        <StatCard
          label="In Progress"
          value={statusCounts['in_progress'] ?? 0}
          href="/parts?status=in_progress"
        />
        <StatCard
          label="Complete"
          value={statusCounts['complete'] ?? 0}
          href="/parts?status=complete"
        />
      </div>

      {/* Status breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Parts by Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {statuses.map((status) => (
            <Link
              key={status}
              href={`/parts?status=${status}`}
              className="flex flex-col items-center p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <span className="text-2xl font-bold text-gray-900">
                {statusCounts[status] ?? 0}
              </span>
              <StatusBadge status={status} size="sm" />
            </Link>
          ))}
        </div>
      </div>

      {/* My assigned parts */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">My Assigned Parts</h2>
          <Link href="/parts?assigned=me" className="text-sm text-blue-600 hover:text-blue-700">
            View all
          </Link>
        </div>
        {myParts.length === 0 ? (
          <p className="text-gray-500 text-sm">No parts assigned to you.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {myParts.map((part) => {
              const assembly = part.assemblies as unknown as { assembly_number: string; name: string } | null;
              return (
                <div key={part.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Link
                      href={`/parts/${part.id}`}
                      className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
                    >
                      {part.part_number && (
                        <span className="font-mono text-xs text-gray-500 mr-2">
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

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/assemblies/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Assembly
        </Link>
        <Link
          href="/parts/new"
          className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          + New Part
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300 transition-colors"
    >
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </Link>
  );
}
