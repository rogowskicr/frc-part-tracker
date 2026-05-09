import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import type { PartStatus } from '@/lib/types';
import { PART_STATUS_LABELS } from '@/lib/types';
import UpdateStatusForm from './UpdateStatusForm';
import DeletePartButton from './DeletePartButton';

export default async function PartDetailPage({
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

  const [profileRes, partRes, historyRes] = await Promise.all([
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
    supabase
      .from('parts')
      .select(
        `
        id, part_number, name, description, type, status, naming_flagged, cad_link, created_at, onshape_part_id,
        assembly:assembly_id(id, assembly_number, name),
        assigned_user:assigned_to(id, name),
        bom_items(onshape_quantity, cots_quantity_spare, cots_vendor, cots_supplier_part_number, cots_purchase_link)
      `
      )
      .eq('id', id)
      .single(),
    supabase
      .from('part_status_history')
      .select('id, status, changed_at, notes, changed_by_user:changed_by(name)')
      .eq('part_id', id)
      .order('changed_at', { ascending: false })
      .limit(20),
  ]);

  if (!partRes.data) notFound();

  const part = partRes.data;
  const history = historyRes.data ?? [];
  const role = profileRes.data?.role ?? 'viewer';
  const canMutate = role === 'admin' || role === 'engineer';
  const isAdmin = role === 'admin';

  const assembly = part.assembly as unknown as { id: string; assembly_number: string; name: string } | null;
  const assignedUser = part.assigned_user as unknown as { id: string; name: string } | null;
  const bom = (
    part.bom_items as Array<{
      onshape_quantity: number;
      cots_quantity_spare: number;
      cots_vendor: string | null;
      cots_supplier_part_number: string | null;
      cots_purchase_link: string | null;
    }>
  )?.[0];

  const statuses: PartStatus[] = [
    'design',
    'ready_for_manufacturing',
    'in_progress',
    'complete',
    'on_hold',
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
        <Link href="/parts" className="hover:text-gray-300">Parts</Link>
        <span>›</span>
        {assembly && (
          <>
            <Link href={`/assemblies/${assembly.id}`} className="hover:text-gray-300">
              {assembly.assembly_number}
            </Link>
            <span>›</span>
          </>
        )}
        {part.part_number && (
          <span className="font-mono font-semibold text-blue-400">{part.part_number}</span>
        )}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            {part.part_number && (
              <span className="font-mono text-sm font-semibold text-blue-400 bg-blue-900/30 px-2 py-1 rounded">
                {part.part_number}
              </span>
            )}
            <h1 className="text-2xl font-bold text-gray-100">{part.name}</h1>
            {part.naming_flagged && (
              <span
                title="Part name may not conform to the expected format"
                className="inline-flex items-center gap-1 text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-700 px-2 py-0.5 rounded-full"
              >
                ⚠ Name flagged
              </span>
            )}
            {part.onshape_part_id && (
              <span
                title="Imported from OnShape"
                className="inline-flex items-center gap-1 text-xs bg-cyan-900/40 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded-full font-mono"
              >
                OS Imported
              </span>
            )}
          </div>
          {part.description && <p className="mt-2 text-gray-300">{part.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={part.status as PartStatus} />
          {canMutate && (
            <Link
              href={`/parts/${id}/edit`}
              className="px-3 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
            >
              Edit
            </Link>
          )}
          {isAdmin && <DeletePartButton partId={id} assemblyId={assembly?.id ?? ''} />}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Details card */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
          <h2 className="font-semibold text-gray-100">Details</h2>
          <DetailRow label="Type" value={part.type === 'off_shelf' ? 'Off-the-Shelf' : 'Manufactured'} />
          {assembly && (
            <DetailRow
              label="Assembly"
              value={
                <Link href={`/assemblies/${assembly.id}`} className="text-blue-400 hover:text-blue-300">
                  {assembly.assembly_number} — {assembly.name}
                </Link>
              }
            />
          )}
          {assignedUser && (
            <DetailRow label="Assigned To" value={assignedUser.name} />
          )}
          {bom && (
            <>
              <DetailRow
                label="Required Qty"
                value={`${bom.onshape_quantity} + ${bom.cots_quantity_spare} spare = ${bom.onshape_quantity + bom.cots_quantity_spare} total`}
              />
              {bom.cots_vendor && <DetailRow label="Vendor" value={bom.cots_vendor} />}
              {bom.cots_supplier_part_number && (
                <DetailRow label="Supplier P/N" value={<span className="font-mono text-sm">{bom.cots_supplier_part_number}</span>} />
              )}
              {bom.cots_purchase_link && (
                <DetailRow
                  label="Purchase Link"
                  value={
                    <a
                      href={bom.cots_purchase_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-sm truncate block"
                    >
                      🔗 Buy
                    </a>
                  }
                />
              )}
            </>
          )}
          {part.cad_link && (
            <DetailRow
              label="CAD"
              value={
                <a
                  href={part.cad_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  🔗 {part.onshape_part_id ? 'Open in OnShape' : 'Open in CAD'}
                </a>
              }
            />
          )}
        </div>

        {/* Update status */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
          <h2 className="font-semibold text-gray-100">Status</h2>
          {canMutate ? (
            <UpdateStatusForm partId={id} currentStatus={part.status as PartStatus} statuses={statuses} />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-gray-400">Current status</p>
              <StatusBadge status={part.status as PartStatus} />
              <p className="text-xs text-gray-500 mt-2">Viewers cannot update status.</p>
            </div>
          )}
        </div>
      </div>

      {/* Status history */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h2 className="font-semibold text-gray-100 mb-4">Status History</h2>
        {history.length === 0 ? (
          <p className="text-gray-400 text-sm">No history yet.</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => {
              const changedBy = entry.changed_by_user as unknown as { name: string } | null;
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className="mt-1">
                    <StatusBadge status={entry.status as PartStatus} size="sm" />
                  </div>
                  <div className="text-xs text-gray-400">
                    <span>{new Date(entry.changed_at).toLocaleString()}</span>
                    {changedBy && <span className="ml-1">by {changedBy.name}</span>}
                    {entry.notes && <p className="mt-0.5 text-gray-300">{entry.notes}</p>}
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-gray-400 shrink-0">{label}</span>
      <span className="text-gray-100 text-right">{value}</span>
    </div>
  );
}
