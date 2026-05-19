'use client';

import { useState, useRef, useEffect } from 'react';
import { updatePartStatus } from '@/app/actions/parts';
import { PART_STATUS_LABELS, PART_STATUS_COLORS } from '@/lib/types';
import type { PartStatus } from '@/lib/types';

const STATUSES: PartStatus[] = [
  'design', 'ready_for_manufacturing', 'in_progress',
  'manufacturing_complete', 'ready_for_powder_coating', 'powder_coating_complete',
  'robot_ready', 'on_hold', 'ready_for_order',
];

interface Props {
  partId: string;
  currentStatus: PartStatus;
  canMutate: boolean;
}

export default function InlineStatusButton({ partId, currentStatus, canMutate }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PartStatus>(currentStatus);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  async function handleSave() {
    if (!reason.trim()) return;
    setSaving(true);
    setError('');
    const result = await updatePartStatus(partId, selected, reason.trim());
    setSaving(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setOpen(false);
      setReason('');
    }
  }

  const colorClass = PART_STATUS_COLORS[currentStatus] ?? 'bg-gray-700 text-gray-300';

  if (!canMutate) {
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
        {PART_STATUS_LABELS[currentStatus]}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSelected(currentStatus); setReason(''); setError(''); }}
        title="Click to change status"
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${colorClass}`}
      >
        {PART_STATUS_LABELS[currentStatus]}
        <span className="opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-72 bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-3 space-y-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value as PartStatus)}
            className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-100 focus:outline-none focus:border-blue-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{PART_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for change (required)…"
            rows={2}
            className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1">Cancel</button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !reason.trim()}
              className="px-2.5 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
