import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import type { PartStatus } from '@/lib/types';
import { PART_STATUS_LABELS } from '@/lib/types';

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assembly?: string; assigned?: string }>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return <div className="text-gray-500 py-8">No team assigned.</div>;

  let query = supabase
    .from('parts')
    .select(
      `
      id, part_number, name, type, status, naming_flagged, assigned_to, created_at,
      assembly:assembly_id(id, assembly_number, name),
      assigned_user:assigned_to(name)
    `
    )
    .eq('team_id', profile.team_id)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.assembly) {
    query = query.eq('assembly_id', filters.assembly);
  }
  if (filters.assigned === 'me') {
    query = query.eq('assigned_to', user.id);
  }

  const { data: parts } = await query;

  const statuses: PartStatus[] = [
    'design',
    'ready_for_manufacturing',
    'in_progress',
    'complete',
    'on_hold',
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parts</h1>
          <p className="text-gray-500 mt-1">{parts?.length ?? 0} shown</p>
        </div>
        <Link
          href="/parts/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Part
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <FilterChip href="/parts" label="All" active={!filters.status && !filters.assigned} />
        <FilterChip
          href="/parts?assigned=me"
          label="Assigned to me"
          active={filters.assigned === 'me'}
        />
        {statuses.map((s) => (
          <FilterChip
            key={s}
            href={`/parts?status=${s}`}
            label={PART_STATUS_LABELS[s]}
            active={filters.status === s}
          />
        ))}
      </div>

      {!parts || parts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="divide-y divide-gray-100">
            {parts.map((part) => {
              const assembly = part.assembly as unknown as {
                id: string;
                assembly_number: string;
                name: string;
              } | null;
              const assignedUser = part.assigned_user as unknown as { name: string } | null;

              return (
                <div
                  key={part.id}
                  className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {part.part_number && (
                        <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                          {part.part_number}
                        </span>
                      )}
                      <Link
                        href={`/parts/${part.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
                      >
                        {part.name}
                      </Link>
                      {part.naming_flagged && (
                        <span title="Name may not conform to part number format" className="text-yellow-500 text-xs">
                          ⚠
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {assembly && (
                        <Link
                          href={`/assemblies/${assembly.id}`}
                          className="text-xs text-gray-400 hover:text-blue-500"
                        >
                          {assembly.assembly_number} — {assembly.name}
                        </Link>
                      )}
                      <span className="text-xs text-gray-400 capitalize">
                        {part.type === 'off_shelf' ? 'Off-shelf' : 'Manufactured'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {assignedUser && (
                      <span className="text-xs text-gray-500 hidden sm:block">
                        {assignedUser.name}
                      </span>
                    )}
                    <StatusBadge status={part.status as PartStatus} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
      <span className="text-4xl">🔩</span>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No parts found</h3>
      <p className="mt-2 text-gray-500 text-sm">
        Add parts to an assembly or create one here.
      </p>
      <Link
        href="/parts/new"
        className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        + New Part
      </Link>
    </div>
  );
}
