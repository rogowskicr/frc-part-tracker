'use client';

import { useState } from 'react';
import { bulkUpdateAssemblyStatus } from '@/app/actions/parts';
import { PART_STATUS_LABELS } from '@/lib/types';
import type { PartStatus } from '@/lib/types';

const STATUSES: PartStatus[] = [
  'design', 'ready_for_manufacturing', 'in_progress',
  'manufacturing_complete', 'ready_for_powder_coating', 'powder_coating_complete',
  'robot_ready', 'on_hold', 'ready_for_order',
];

interface Props {
  assemblyId: string;
}

export default function BulkStatusUpdate({ assemblyId }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<PartStatus>('design');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    const result = await bulkUpdateAssemblyStatus(assemblyId, status, reason.trim());
    setSaving(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setReason('');
      setTimeout(() => { setOpen(false); setSuccess(false); }, 1200);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
      >
        Bulk Status Update
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-20 w-80 bg-gray-800 border border-gray-600 rounded-xl shadow-xl p-4 space-y-3">
          <h3 className="font-semibold text-gray-100 text-sm">Update All Parts &amp; Subassemblies</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">New Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PartStatus)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:border-blue-500"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{PART_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reason <span className="text-red-400">*</span></label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why status is changing…"
                rows={2}
                required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            {success && <p className="text-xs text-emerald-400">Status updated.</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !reason.trim()}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Applying…' : 'Apply to All'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
