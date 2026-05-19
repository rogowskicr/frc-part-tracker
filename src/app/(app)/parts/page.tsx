import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import StatusBadge from '@/components/StatusBadge';
import type { PartStatus } from '@/lib/types';

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assembly?: string; assigned?: string; type?: string; q?: string; sort?: string; order?: string }>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, active_project_code, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return <div className="text-gray-400 py-8">No team assigned.</div>;

  const activeCode = profile.active_project_code ?? null;
  const canCreate = activeCode && profile.role !== 'viewer';

  // When a project is active, pre-fetch the assembly IDs for that project prefix so
  // parts are filtered to only items belonging to that project.
  let projectAssemblyIds: string[] | null = null;
  if (activeCode) {
    const { data: projectAssemblies } = await supabase
      .from('assemblies')
      .select('id')
      .eq('team_id', profile.team_id)
      .gte('assembly_number', `${activeCode}_`)
      .lt('assembly_number', activeCode + '\x60');
    projectAssemblyIds = (projectAssemblies ?? []).map((a) => a.id);
  }

  let query = supabase
    .from('parts')
    .select(
      `
      id, part_number, name, type, status, naming_flagged, assigned_to, created_at,
      onshape_part_id, onshape_element_id,
      assembly:assembly_id(id, assembly_number, name),
      assigned_user:assigned_to(name),
      bom_items(onshape_quantity, cots_quantity_spare, cots_vendor, cots_purchase_link)
    `
    )
    .eq('team_id', profile.team_id)
    .order('created_at', { ascending: false });

  if (projectAssemblyIds !== null) {
    if (projectAssemblyIds.length === 0) {
      query = query.in('assembly_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      query = query.in('assembly_id', projectAssemblyIds);
    }
  }

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.assembly) {
    query = query.eq('assembly_id', filters.assembly);
  }
  if (filters.assigned === 'me') {
    query = query.eq('assigned_to', user.id);
  }
  if (filters.type === 'off_shelf' || filters.type === 'manufactured') {
    query = query.eq('type', filters.type);
  }
  if (filters.q) {
    const q = filters.q.trim();
    query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%`);
  }

  const { data: rawParts } = await query;

  // ── Deduplicate: merge parts sharing the same OnShape identity ──────────────
  // Assembly-specific qty and spare are summed across all instances.
  type RawPart = NonNullable<typeof rawParts>[number];
  type AssemblyRef = { id: string; assembly_number: string; name: string };
  type DedupedPart = RawPart & {
    total_qty: number;
    total_spare: number;
    assembly_list: AssemblyRef[];
    worst_status: PartStatus;
  };

  // Status priority — highest index = furthest behind in the pipeline
  const STATUS_PRIORITY: PartStatus[] = [
    'robot_ready',
    'powder_coating_complete',
    'ready_for_powder_coating',
    'manufacturing_complete',
    'in_progress',
    'on_hold',
    'ready_for_manufacturing',
    'ready_for_order',
    'design',
  ];
  function worstStatus(statuses: PartStatus[]): PartStatus {
    return statuses.reduce((worst, s) =>
      STATUS_PRIORITY.indexOf(s) > STATUS_PRIORITY.indexOf(worst) ? s : worst,
      statuses[0] ?? 'design'
    );
  }

  const grouped = new Map<string, DedupedPart>();
  for (const part of rawParts ?? []) {
    // Key by name alone for OnShape parts — the same physical part can come from
    // different elements across assemblies or library versions.
    const key = part.onshape_element_id
      ? `os:${part.name.trim().toLowerCase()}`
      : `id:${part.id}`;

    const bom = (part.bom_items as Array<{
      onshape_quantity: number;
      cots_quantity_spare: number;
      cots_vendor: string | null;
      cots_purchase_link: string | null;
    }>)?.[0];
    const assembly = part.assembly as unknown as AssemblyRef | null;

    const existing = grouped.get(key);
    if (existing) {
      existing.total_qty   += bom?.onshape_quantity ?? 0;
      existing.total_spare += bom?.cots_quantity_spare ?? 0;
      if (assembly && !existing.assembly_list.some((a) => a.id === assembly.id)) {
        existing.assembly_list.push(assembly);
      }
      existing.worst_status = worstStatus([existing.worst_status, part.status as PartStatus]);
    } else {
      grouped.set(key, {
        ...part,
        total_qty:     bom?.onshape_quantity ?? 0,
        total_spare:   bom?.cots_quantity_spare ?? 0,
        assembly_list: assembly ? [assembly] : [],
        worst_status:  part.status as PartStatus,
      });
    }
  }

  let parts = Array.from(grouped.values());

  // Client-side sort after dedup
  const sortKey = filters.sort ?? 'created_at';
  const sortAsc = filters.order !== 'desc';
  parts = parts.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortKey === 'part_number') {
      cmp = (a.part_number ?? '').localeCompare(b.part_number ?? '');
    } else if (sortKey === 'status') {
      cmp = STATUS_PRIORITY.indexOf(b.worst_status) - STATUS_PRIORITY.indexOf(a.worst_status);
    } else if (sortKey === 'assembly') {
      const aAsm = a.assembly_list[0]?.assembly_number ?? '';
      const bAsm = b.assembly_list[0]?.assembly_number ?? '';
      cmp = aAsm.localeCompare(bAsm);
    } else {
      // Default: created_at (already sorted by DB, keep order)
      cmp = 0;
    }
    return sortAsc ? cmp : -cmp;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Parts</h1>
          <p className="text-gray-400 mt-1">
            {parts.length} unique part{parts.length !== 1 ? 's' : ''}{rawParts && rawParts.length !== parts.length ? ` (${rawParts.length} total instances)` : ''}
            {activeCode ? ` · Project ${activeCode}` : ''}
          </p>
        </div>
        {canCreate ? (
          <Link
            href="/parts/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + New Part
          </Link>
        ) : (
          <span
            title={!activeCode ? 'Select a project from the Team page first' : 'Viewers cannot create parts'}
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-600 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            + New Part
          </span>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <FilterChip href="/parts" label="All" active={!filters.status && !filters.assigned && !filters.type} />
        <FilterChip href="/parts?assigned=me" label="Assigned to me" active={filters.assigned === 'me'} />
        <FilterChip href="/parts?type=off_shelf" label="COTS Parts" active={filters.type === 'off_shelf'} />
        <FilterChip href="/parts?type=manufactured" label="Manufactured Parts" active={filters.type === 'manufactured'} />
        <FilterChip href="/parts?status=on_hold" label="On Hold" active={filters.status === 'on_hold'} />
      </div>

      {/* Sort row + search */}
      {(() => {
        const currentSort = filters.sort ?? 'created_at';
        const currentOrder = filters.order ?? 'desc';
        const baseParams = new URLSearchParams();
        if (filters.status) baseParams.set('status', filters.status);
        if (filters.assigned) baseParams.set('assigned', filters.assigned);
        if (filters.type) baseParams.set('type', filters.type);
        if (filters.q) baseParams.set('q', filters.q);
        function sortHref(key: string) {
          const p = new URLSearchParams(baseParams);
          p.set('sort', key);
          p.set('order', currentSort === key && currentOrder === 'asc' ? 'desc' : 'asc');
          return `/parts?${p.toString()}`;
        }
        const sortButtons = [
          { key: 'created_at', label: 'Date Added' },
          { key: 'name', label: 'Name' },
          { key: 'part_number', label: 'Part No.' },
          { key: 'status', label: 'Status' },
          { key: 'assembly', label: 'Assembly' },
        ];
        return (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-gray-500 mr-1">Sort:</span>
              {sortButtons.map(({ key, label }) => (
                <Link
                  key={key}
                  href={sortHref(key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    currentSort === key
                      ? 'bg-gray-600 text-gray-100'
                      : 'bg-gray-800 border border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                  }`}
                >
                  {label}{currentSort === key ? <span className="ml-0.5">{currentOrder === 'asc' ? '↑' : '↓'}</span> : null}
                </Link>
              ))}
            </div>
            <form method="GET" action="/parts" className="flex items-center gap-1.5 shrink-0">
              {filters.status && <input type="hidden" name="status" value={filters.status} />}
              {filters.assigned && <input type="hidden" name="assigned" value={filters.assigned} />}
              {filters.type && <input type="hidden" name="type" value={filters.type} />}
              {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}
              {filters.order && <input type="hidden" name="order" value={filters.order} />}
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
                <input
                  type="text"
                  name="q"
                  defaultValue={filters.q ?? ''}
                  placeholder="Search…"
                  className="pl-7 pr-2 py-1.5 w-44 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button type="submit" className="px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-200 hover:bg-gray-600 transition-colors">
                Go
              </button>
              {filters.q && (
                <Link
                  href={`/parts?${(() => { const p = new URLSearchParams(baseParams); p.delete('q'); return p.toString(); })()}`}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  ✕
                </Link>
              )}
            </form>
          </div>
        );
      })()}

      {!parts || parts.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-700">
            {parts.map((part) => {
              const assignedUser = part.assigned_user as unknown as { name: string } | null;
              const bom = (part.bom_items as Array<{
                cots_vendor: string | null;
                cots_purchase_link: string | null;
              }>)?.[0];

              return (
                <div
                  key={part.id}
                  className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-700/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {part.part_number && (
                        <span className="font-mono text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded shrink-0">
                          {part.part_number}
                        </span>
                      )}
                      <Link
                        href={`/parts/${part.id}`}
                        className="text-sm font-medium text-gray-100 hover:text-blue-400 truncate"
                      >
                        {part.name}
                      </Link>
                      {part.onshape_part_id && (
                        <span title="Imported from OnShape" className="text-cyan-400 text-xs font-mono bg-cyan-900/30 px-1 rounded">
                          OS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {/* Assembly list */}
                      {part.assembly_list.length === 1 ? (
                        <Link
                          href={`/assemblies/${part.assembly_list[0].id}`}
                          className="text-xs text-gray-500 hover:text-blue-400"
                        >
                          {part.assembly_list[0].assembly_number}
                        </Link>
                      ) : part.assembly_list.length > 1 ? (
                        <span className="text-xs text-gray-500">
                          {part.assembly_list.map((a, i) => (
                            <span key={a.id}>
                              {i > 0 && <span className="mx-1 text-gray-600">·</span>}
                              <Link href={`/assemblies/${a.id}`} className="hover:text-blue-400">
                                {a.assembly_number}
                              </Link>
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className="text-xs text-gray-500 capitalize">
                        {part.type === 'off_shelf' ? 'Off-shelf' : 'Manufactured'}
                      </span>
                      <span className="text-xs text-gray-500">
                        Qty: {part.total_qty}
                        {part.total_spare > 0 && (
                          <span className="ml-1 text-gray-600">+{part.total_spare} spare</span>
                        )}
                      </span>
                      {bom?.cots_vendor && (
                        <span className="text-xs text-gray-600">{bom.cots_vendor}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {assignedUser && (
                      <span className="text-xs text-gray-500 hidden sm:block">
                        {assignedUser.name}
                      </span>
                    )}
                    <StatusBadge status={part.worst_status} size="sm" />
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
          : 'bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700'
      }`}
    >
      {label}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
      <span className="text-4xl">🔩</span>
      <h3 className="mt-4 text-lg font-medium text-gray-100">No parts found</h3>
      <p className="mt-2 text-gray-400 text-sm">
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
