import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import type { PartStatus } from '@/lib/types';
import DeleteAssemblyButton from './DeleteAssemblyButton';
import OnshapePanel from './OnshapePanel';
import PartQtyEditor from './PartQtyEditor';

export default async function AssemblyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [profileRes, assemblyRes] = await Promise.all([
    supabase.from('user_profiles').select('role, team_id').eq('id', user.id).single(),
    supabase
      .from('assemblies')
      .select(
        `
        id, assembly_number, name, description, cad_link, created_at,
        onshape_doc_id, onshape_workspace_id, onshape_element_id, onshape_last_sync,
        parent:parent_assembly_id(id, assembly_number, name)
      `
      )
      .eq('id', id)
      .single(),
  ]);

  if (!assemblyRes.data) notFound();

  const assembly = assemblyRes.data;
  const role = profileRes.data?.role ?? 'viewer';
  const teamId = profileRes.data?.team_id ?? null;
  const canMutate = role === 'admin' || role === 'engineer';
  const isAdmin = role === 'admin';

  const hasCredsRes = teamId
    ? await supabase.rpc('has_onshape_credentials', { p_team_id: teamId })
    : { data: false };
  const hasOnshapeCredentials = !!(hasCredsRes.data);

  const { data: parts } = await supabase
    .from('parts')
    .select(
      `
      id, part_number, name, type, status, naming_flagged, assigned_to, onshape_part_id,
      onshape_element_id,
      assigned_user:assigned_to(name),
      bom_items(onshape_quantity, cots_quantity_spare, cots_vendor, cots_purchase_link)
    `
    )
    .eq('assembly_id', id)
    .order('part_number', { ascending: true });

  // ── Global spare sums ─────────────────────────────────────────────────────
  // Spare qty is a project-level total across all assemblies that use this part.
  // Key by name (same strategy as import/parts-page dedup).
  const onshapePartNames = [...new Set(
    (parts ?? [])
      .filter((p) => p.onshape_element_id)
      .map((p) => p.name.trim().toLowerCase())
  )];

  const globalSpareMap = new Map<string, number>(); // key: name (lowercase)

  if (onshapePartNames.length > 0) {
    const { data: allSimilar } = await supabase
      .from('parts')
      .select('name, bom_items(cots_quantity_spare)')
      .eq('team_id', teamId ?? '')
      .not('onshape_element_id', 'is', null);

    for (const p of allSimilar ?? []) {
      const key = p.name.trim().toLowerCase();
      if (!onshapePartNames.includes(key)) continue;
      const bom = (p.bom_items as Array<{ cots_quantity_spare: number }>)?.[0];
      globalSpareMap.set(key, (globalSpareMap.get(key) ?? 0) + (bom?.cots_quantity_spare ?? 0));
    }
  }

  const parent = assembly.parent as unknown as { id: string; assembly_number: string; name: string } | null;

  // Status summary counts
  const statusCounts = (parts ?? []).reduce(
    (acc, p) => {
      acc[p.status as PartStatus] = (acc[p.status as PartStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<PartStatus, number>
  );
  const statusOrder: PartStatus[] = [
    'design', 'ready_for_manufacturing', 'in_progress',
    'manufacturing_complete', 'ready_for_powder_coating', 'powder_coating_complete',
    'robot_ready', 'on_hold',
  ];
  const statusLabels: Record<PartStatus, string> = {
    design: 'Design',
    ready_for_manufacturing: 'Mfg Ready',
    in_progress: 'In Progress',
    manufacturing_complete: 'Mfg Complete',
    ready_for_powder_coating: 'Powder Coat Ready',
    powder_coating_complete: 'Powder Coat Done',
    robot_ready: 'Robot Ready',
    on_hold: 'On Hold',
  };
  const statusColors: Record<PartStatus, string> = {
    design: 'bg-blue-900/40 text-blue-300',
    ready_for_manufacturing: 'bg-yellow-900/40 text-yellow-300',
    in_progress: 'bg-orange-900/40 text-orange-300',
    manufacturing_complete: 'bg-green-900/40 text-green-300',
    ready_for_powder_coating: 'bg-purple-900/40 text-purple-300',
    powder_coating_complete: 'bg-violet-900/40 text-violet-300',
    robot_ready: 'bg-emerald-900/40 text-emerald-300',
    on_hold: 'bg-gray-700 text-gray-300',
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/assemblies" className="hover:text-gray-300">
          Assemblies
        </Link>
        <span>›</span>
        {parent && (
          <>
            <Link href={`/assemblies/${parent.id}`} className="hover:text-gray-300">
              {parent.assembly_number}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="font-mono font-semibold text-blue-400">{assembly.assembly_number}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-blue-400 bg-blue-900/30 px-2 py-1 rounded">
              {assembly.assembly_number}
            </span>
            <h1 className="text-2xl font-bold text-gray-100">{assembly.name}</h1>
          </div>
          {assembly.description && (
            <p className="mt-2 text-gray-300">{assembly.description}</p>
          )}
          {assembly.cad_link && (
            <a
              href={assembly.cad_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
            >
              🔗 Open in CAD
            </a>
          )}
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap">
          {canMutate && (
            <>
              <Link
                href={`/parts/new?assembly=${id}`}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                + Add Part
              </Link>
              <Link
                href={`/assemblies/new?parent=${id}`}
                className="px-3 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
              >
                + Sub-Assembly
              </Link>
              <Link
                href={`/assemblies/${id}/edit`}
                className="px-3 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
              >
                Edit
              </Link>
            </>
          )}
          {isAdmin && <DeleteAssemblyButton assemblyId={id} />}
        </div>
      </div>

      {/* Status summary */}
      {(parts?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {statusOrder.map((s) => {
            const count = statusCounts[s] ?? 0;
            if (count === 0) return null;
            return (
              <span
                key={s}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${statusColors[s]}`}
              >
                <span className="font-bold">{count}</span>
                {statusLabels[s]}
              </span>
            );
          })}
        </div>
      )}

      {/* OnShape panel */}
      <OnshapePanel
        assemblyId={id}
        canMutate={canMutate}
        hasOnshapeCredentials={hasOnshapeCredentials}
        currentDocId={assembly.onshape_doc_id ?? null}
        currentWorkspaceId={assembly.onshape_workspace_id ?? null}
        currentElementId={assembly.onshape_element_id ?? null}
        lastSync={assembly.onshape_last_sync ?? null}
      />

      {/* Parts table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-semibold text-gray-100">
            Parts <span className="text-gray-500 font-normal ml-1">{parts?.length ?? 0}</span>
          </h2>
        </div>

        {!parts || parts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            No parts yet.{' '}
            {canMutate && (
              <Link href={`/parts/new?assembly=${id}`} className="text-blue-400 hover:text-blue-300">
                Add the first part
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {parts.map((part) => {
              const bom = (part.bom_items as Array<{
                onshape_quantity: number;
                cots_quantity_spare: number;
                cots_vendor: string | null;
                cots_purchase_link: string | null;
              }>)?.[0];
              const assignedUser = part.assigned_user as unknown as { name: string } | null;

              return (
                <div key={part.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-700/50">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
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
                        {part.naming_flagged && (
                          <span title="Name may not conform to part number format" className="text-yellow-500 text-xs shrink-0">
                            ⚠
                          </span>
                        )}
                        {part.onshape_part_id && (
                          <span title="Imported from OnShape" className="text-cyan-400 text-xs shrink-0 font-mono bg-cyan-900/30 px-1 rounded">
                            OS
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-500 capitalize">
                          {part.type === 'off_shelf' ? 'Off-shelf' : 'Manufactured'}
                        </span>
                        {bom && (
                          <PartQtyEditor
                            partId={part.id}
                            assemblyId={id}
                            quantity={bom.onshape_quantity}
                            canMutate={canMutate}
                          />
                        )}
                        {(() => {
                          const globalSpare = part.onshape_element_id
                            ? (globalSpareMap.get(part.name.trim().toLowerCase()) ?? bom?.cots_quantity_spare ?? 0)
                            : (bom?.cots_quantity_spare ?? 0);
                          return globalSpare > 0 ? (
                            <span
                              title="Total spare quantity across all assemblies"
                              className="text-xs text-gray-600"
                            >
                              +{globalSpare} spare
                            </span>
                          ) : null;
                        })()}
                        {bom?.cots_vendor && (
                          <span className="text-xs text-gray-500">{bom.cots_vendor}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {assignedUser && (
                      <span className="text-xs text-gray-400 hidden sm:block">{assignedUser.name}</span>
                    )}
                    <StatusBadge status={part.status as PartStatus} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
