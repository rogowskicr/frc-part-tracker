'use client';

import { useState } from 'react';
import { updatePartStatus } from '@/app/actions/parts';
import type { PartStatus } from '@/lib/types';
import { PART_STATUS_LABELS } from '@/lib/types';

interface Props {
  partId: string;
  currentStatus: PartStatus;
  statuses: PartStatus[];
}

export default function UpdateStatusForm({ partId, currentStatus, statuses }: Props) {
  const [selected, setSelected] = useState<PartStatus>(currentStatus);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected === currentStatus) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    const result = await updatePartStatus(partId, selected, notes);
    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setNotes('');
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="p-2 rounded bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
      )}
      {success && (
        <div className="p-2 rounded bg-green-50 text-green-700 text-sm border border-green-200">
          Status updated!
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">New Status</label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value as PartStatus)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {statuses.map((s) => (
            <option key={s} value={s}>
              {PART_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="Reason for status change…"
        />
      </div>

      <button
        type="submit"
        disabled={loading || selected === currentStatus}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Updating…' : 'Update Status'}
      </button>
    </form>
  );
}
