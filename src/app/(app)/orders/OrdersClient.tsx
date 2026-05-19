'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateOrderStatus, markLineReceived, markLineOrdered } from '@/app/actions/orders';

export type OrderLine = {
  name: string;
  part_ids: string[];
  part_number: string | null;
  cots_vendor: string | null;
  cots_supplier_part_number: string | null;
  cots_purchase_link: string | null;
  total_required: number;
  total_spare: number;
  assembly_list: { id: string; assembly_number: string; name: string }[];
  received: boolean;
  ordered: boolean;
  missing_info: boolean;
};

export type VendorGroup = {
  vendor: string;
  status: 'pending' | 'ordered' | 'received';
  lines: OrderLine[];
  isOutsourced?: boolean;
};

const STATUS_COLORS = {
  pending: 'bg-gray-700 text-gray-300',
  ordered: 'bg-blue-900/50 text-blue-300',
  received: 'bg-green-900/50 text-green-300',
};

const STATUS_LABELS = {
  pending: 'Pending',
  ordered: 'Ordered',
  received: 'Received',
};

const NEXT_STATUS: Record<string, 'pending' | 'ordered' | 'received'> = {
  pending: 'ordered',
  ordered: 'received',
  received: 'pending',
};

const NEXT_LABEL: Record<string, string> = {
  pending: 'Mark as Ordered',
  ordered: 'Mark as Received',
  received: 'Reset to Pending',
};

export default function OrdersClient({
  vendorGroups,
  needsInfoLines,
  projectCode,
  canEdit,
  allLines,
}: {
  vendorGroups: VendorGroup[];
  needsInfoLines: OrderLine[];
  projectCode: string;
  canEdit: boolean;
  allLines: OrderLine[];
}) {
  const TABS = ['All', ...vendorGroups.map((g) => g.vendor), ...(needsInfoLines.length > 0 ? ['Needs Info'] : [])];
  const [activeTab, setActiveTab] = useState('All');
  const [pending, startTransition] = useTransition();

  function handleStatusUpdate(vendor: string, currentStatus: string, vendorLines: OrderLine[]) {
    const next = NEXT_STATUS[currentStatus];
    const partIds = vendorLines.flatMap((l) => l.part_ids);
    startTransition(async () => {
      await updateOrderStatus(vendor, projectCode, next, partIds);
    });
  }

  function handleReceived(line: OrderLine, received: boolean) {
    startTransition(async () => {
      await markLineReceived(line.part_ids, received);
    });
  }

  function handleOrdered(line: OrderLine, ordered: boolean) {
    startTransition(async () => {
      await markLineOrdered(line.part_ids, ordered);
    });
  }

  function exportCSV() {
    const rows = [
      ['Part Name', 'Part Number', 'Vendor', 'Supplier P/N', 'Qty Required', 'Spare Qty', 'Total Qty', 'Purchase Link'],
      ...allLines.map((l) => [
        l.name,
        l.part_number ?? '',
        l.cots_vendor ?? '',
        l.cots_supplier_part_number ?? '',
        String(l.total_required),
        String(l.total_spare),
        String(l.total_required + l.total_spare),
        l.cots_purchase_link ?? '',
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cots-orders-${projectCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeVendorGroups =
    activeTab === 'All'
      ? vendorGroups
      : activeTab === 'Needs Info'
      ? []
      : vendorGroups.filter((g) => g.vendor === activeTab);

  const showNeedsInfo = activeTab === 'All' || activeTab === 'Needs Info';

  return (
    <div className="space-y-6">
      {/* Vendor tabs */}
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeTab === tab
                ? tab === 'Needs Info'
                  ? 'bg-amber-600 text-white'
                  : 'bg-blue-600 text-white'
                : tab === 'Needs Info'
                ? 'bg-gray-800 border border-amber-600/50 text-amber-400 hover:bg-amber-900/30'
                : 'bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {tab === 'Needs Info' ? `⚠ Needs Info (${needsInfoLines.length})` : tab}
          </button>
        ))}
      </div>

      {/* Vendor groups */}
      {activeVendorGroups.map((group) => (
        <VendorSection
          key={group.vendor}
          group={group}
          canEdit={canEdit}
          isPending={pending}
          onStatusUpdate={handleStatusUpdate}
          onReceivedToggle={handleReceived}
          onOrderedToggle={handleOrdered}
        />
      ))}

      {/* Needs Info section */}
      {showNeedsInfo && needsInfoLines.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-amber-400">Needs Info</h2>
            <span className="text-xs text-gray-500">
              These parts are missing vendor or supplier part number — fill them in on the part edit page before ordering.
            </span>
          </div>
          <LineTable
            lines={needsInfoLines}
            canEdit={canEdit}
            isPending={pending}
            onReceivedToggle={handleReceived}
            onOrderedToggle={handleOrdered}
          />
        </div>
      )}

      {allLines.length === 0 && (
        <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
          <span className="text-4xl">📦</span>
          <h3 className="mt-4 text-lg font-medium text-gray-100">No COTS parts found</h3>
          <p className="mt-2 text-gray-400 text-sm">
            Import a BOM from OnShape or create off-the-shelf parts manually.
          </p>
        </div>
      )}

      {allLines.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={exportCSV}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}
    </div>
  );
}

function VendorSection({
  group,
  canEdit,
  isPending,
  onStatusUpdate,
  onReceivedToggle,
  onOrderedToggle,
}: {
  group: VendorGroup;
  canEdit: boolean;
  isPending: boolean;
  onStatusUpdate: (vendor: string, status: string, lines: OrderLine[]) => void;
  onReceivedToggle: (line: OrderLine, received: boolean) => void;
  onOrderedToggle: (line: OrderLine, ordered: boolean) => void;
}) {
  const totalItems = group.lines.reduce((s, l) => s + l.total_required + l.total_spare, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-gray-100">{group.vendor}</h2>
          {group.isOutsourced && (
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-700">
              Outsourced
            </span>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[group.status]}`}>
            {STATUS_LABELS[group.status]}
          </span>
          <span className="text-xs text-gray-500">
            {group.lines.length} line{group.lines.length !== 1 ? 's' : ''} · {totalItems} total units
          </span>
        </div>
        {canEdit && (
          <button
            disabled={isPending}
            onClick={() => onStatusUpdate(group.vendor, group.status, group.lines)}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:opacity-50 transition-colors"
          >
            {NEXT_LABEL[group.status]}
          </button>
        )}
      </div>
      <LineTable
        lines={group.lines}
        canEdit={canEdit}
        isPending={isPending}
        onReceivedToggle={onReceivedToggle}
        onOrderedToggle={onOrderedToggle}
      />
    </div>
  );
}

function LineTable({
  lines,
  canEdit,
  isPending,
  onReceivedToggle,
  onOrderedToggle,
}: {
  lines: OrderLine[];
  canEdit: boolean;
  isPending: boolean;
  onReceivedToggle: (line: OrderLine, received: boolean) => void;
  onOrderedToggle: (line: OrderLine, ordered: boolean) => void;
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
            <th className="px-4 py-2 text-left">Part</th>
            <th className="px-4 py-2 text-left hidden sm:table-cell">Assemblies</th>
            <th className="px-4 py-2 text-right">Req</th>
            <th className="px-4 py-2 text-right">Spare</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2 text-center">Order</th>
            {canEdit && <th className="px-4 py-2 text-center">Ordered</th>}
            {canEdit && <th className="px-4 py-2 text-center">Received</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-700">
          {lines.map((line, i) => (
            <tr
              key={i}
              className={`hover:bg-gray-700/50 ${line.missing_info ? 'bg-amber-900/10' : ''} ${line.received ? 'opacity-60' : ''}`}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  {line.missing_info && (
                    <span title="Missing vendor or supplier part number" className="text-amber-400 text-xs">⚠</span>
                  )}
                  <span className={`font-medium text-gray-100 ${line.received ? 'line-through text-gray-500' : ''}`}>
                    {line.name}
                  </span>
                  {line.part_number && (
                    <span className="font-mono text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded shrink-0">
                      {line.part_number}
                    </span>
                  )}
                </div>
                {line.cots_supplier_part_number && (
                  <div className="text-xs text-gray-500 mt-0.5">P/N: {line.cots_supplier_part_number}</div>
                )}
              </td>
              <td className="px-4 py-2.5 hidden sm:table-cell">
                <div className="flex flex-wrap gap-1">
                  {line.assembly_list.map((a) => (
                    <Link
                      key={a.id}
                      href={`/assemblies/${a.id}`}
                      className="text-xs text-gray-500 hover:text-blue-400"
                    >
                      {a.assembly_number}
                    </Link>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2.5 text-right text-gray-200 font-mono">{line.total_required}</td>
              <td className="px-4 py-2.5 text-right text-gray-400 font-mono">
                {line.total_spare > 0 ? `+${line.total_spare}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-100 font-mono font-semibold">
                {line.total_required + line.total_spare}
              </td>
              <td className="px-4 py-2.5 text-center">
                {line.cots_purchase_link ? (
                  <a
                    href={line.cots_purchase_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    Buy
                  </a>
                ) : (
                  <span className="text-xs text-gray-600">—</span>
                )}
              </td>
              {canEdit && (
                <td className="px-4 py-2.5 text-center">
                  <button
                    disabled={isPending}
                    onClick={() => onOrderedToggle(line, !line.ordered)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                      line.ordered
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-500 hover:border-blue-500'
                    }`}
                    title={line.ordered ? 'Mark as not ordered' : 'Mark as ordered'}
                  >
                    {line.ordered && <span className="text-xs leading-none">✓</span>}
                  </button>
                </td>
              )}
              {canEdit && (
                <td className="px-4 py-2.5 text-center">
                  <button
                    disabled={isPending}
                    onClick={() => onReceivedToggle(line, !line.received)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                      line.received
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'border-gray-500 hover:border-green-500'
                    }`}
                    title={line.received ? 'Mark as not received' : 'Mark as received'}
                  >
                    {line.received && <span className="text-xs leading-none">✓</span>}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
