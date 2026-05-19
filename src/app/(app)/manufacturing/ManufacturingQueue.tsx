'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import { updatePartStatus } from '@/app/actions/parts';
import type { PartStatus } from '@/lib/types';
import { PART_STATUS_LABELS } from '@/lib/types';

interface ProcessRow {
  id: string;
  process: { id: string; name: string } | null;
}

interface QueuePart {
  id: string;
  part_number: string | null;
  name: string;
  status: PartStatus;
  onshape_element_id: string | null;
  onshape_part_id: string | null;
  assembly: { id: string; assembly_number: string; name: string } | null;
  assigned_user: { name: string } | null;
  processes: ProcessRow[];
}

interface Props {
  parts: QueuePart[];
  canMutate: boolean;
}

const MFG_STATUSES: PartStatus[] = [
  'ready_for_manufacturing',
  'in_progress',
  'manufacturing_complete',
];

export default function ManufacturingQueue({ parts, canMutate }: Props) {
  const [groupByProcess, setGroupByProcess] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(parts.map((p) => p.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function batchUpdate(status: PartStatus) {
    setFeedback(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      await Promise.all(ids.map((id) => updatePartStatus(id, status)));
      setSelected(new Set());
      setFeedback(`${ids.length} part${ids.length !== 1 ? 's' : ''} updated to ${PART_STATUS_LABELS[status]}`);
    });
  }

  const renderRow = (part: QueuePart) => (
    <div
      key={part.id}
      className="px-4 py-3 flex items-center gap-3 hover:bg-gray-700/50"
    >
      {canMutate && (
        <input
          type="checkbox"
          checked={selected.has(part.id)}
          onChange={() => toggleSelect(part.id)}
          className="rounded border-gray-600 bg-gray-900 text-blue-600 h-4 w-4 shrink-0"
        />
      )}
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
            <span className="text-xs text-cyan-400 font-mono bg-cyan-900/30 px-1 rounded">OS</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-gray-500">
          {part.assembly && (
            <Link href={`/assemblies/${part.assembly.id}`} className="hover:text-blue-400">
              {part.assembly.assembly_number}
            </Link>
          )}
          {part.assigned_user && (
            <span>{part.assigned_user.name}</span>
          )}
          {part.processes.length > 0 && (
            <span className="text-gray-600">
              {part.processes.map((r) => r.process?.name).filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {part.onshape_element_id ? (
          <>
            <a
              href={`/api/onshape/export?partId=${part.id}&format=stl`}
              className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              title="Download STL (5–15s)"
            >
              STL
            </a>
            <a
              href={`/api/onshape/export?partId=${part.id}&format=step`}
              className="px-2 py-0.5 text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded hover:bg-gray-600 transition-colors"
              title="Download STEP (5–15s)"
            >
              STEP
            </a>
          </>
        ) : (
          <span className="text-xs text-gray-600 px-2">No CAD</span>
        )}
        <StatusBadge status={part.status} size="sm" />
      </div>
    </div>
  );

  // Group by first assigned process name
  const grouped = new Map<string, QueuePart[]>();
  if (groupByProcess) {
    for (const part of parts) {
      const key = part.processes[0]?.process?.name ?? '— No Process';
      const arr = grouped.get(key) ?? [];
      arr.push(part);
      grouped.set(key, arr);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGroupByProcess(false)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${!groupByProcess ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700'}`}
          >
            All Parts
          </button>
          <button
            onClick={() => setGroupByProcess(true)}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${groupByProcess ? 'bg-blue-600 text-white' : 'bg-gray-800 border border-gray-600 text-gray-300 hover:bg-gray-700'}`}
          >
            By Process
          </button>
        </div>
        {canMutate && (
          <div className="flex items-center gap-2">
            <button onClick={selectAll} className="text-xs text-blue-400 hover:text-blue-300">
              Select all
            </button>
            <span className="text-gray-600 text-xs">·</span>
            <button onClick={clearSelection} className="text-xs text-gray-400 hover:text-gray-300">
              Clear
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className="px-4 py-2 bg-green-900/30 border border-green-700 rounded-lg text-sm text-green-300">
          {feedback}
        </div>
      )}

      {parts.length === 0 ? (
        <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
          <p className="text-gray-400">No parts in the manufacturing queue for this project.</p>
          <p className="text-gray-500 text-sm mt-1">Parts appear here when their status is Ready for Manufacturing, In Progress, or Manufacturing Complete.</p>
        </div>
      ) : groupByProcess ? (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([processName, processParts]) => (
            <div key={processName} className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <div className="px-4 py-2 bg-gray-750 border-b border-gray-700">
                <span className="text-sm font-semibold text-gray-200">{processName}</span>
                <span className="ml-2 text-xs text-gray-500">{processParts.length} part{processParts.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-700">
                {processParts.map(renderRow)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="divide-y divide-gray-700">
            {parts.map(renderRow)}
          </div>
        </div>
      )}

      {/* Batch action bar */}
      {canMutate && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-gray-900 border border-gray-600 rounded-xl px-5 py-3 shadow-2xl z-50">
          <span className="text-sm text-gray-300 font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            {MFG_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => batchUpdate(s)}
                disabled={isPending}
                className="px-3 py-1.5 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                → {PART_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <button
            onClick={clearSelection}
            className="text-gray-400 hover:text-white text-xs transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
