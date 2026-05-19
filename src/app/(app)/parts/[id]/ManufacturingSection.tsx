'use client';

import { useState, useTransition } from 'react';
import { addPartManufacturing, removePartManufacturing } from '@/app/actions/manufacturing';

interface Process {
  id: string;
  name: string;
}

interface PartMfgRow {
  id: string;
  outsourced: boolean;
  vendor: string | null;
  notes: string | null;
  process: { id: string; name: string } | null;
}

interface Props {
  partId: string;
  canMutate: boolean;
  processes: Process[];
  partManufacturing: PartMfgRow[];
  hasOnshapeId: boolean;
}

export default function ManufacturingSection({
  partId,
  canMutate,
  processes,
  partManufacturing,
  hasOnshapeId,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [outsourced, setOutsourced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(formData: FormData) {
    setError(null);
    formData.set('part_id', partId);
    formData.set('outsourced', String(outsourced));
    startTransition(async () => {
      const result = await addPartManufacturing(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setShowForm(false);
        setOutsourced(false);
      }
    });
  }

  function handleRemove(id: string) {
    startTransition(async () => {
      await removePartManufacturing(id, partId);
    });
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-100">Manufacturing</h2>
        <div className="flex items-center gap-2">
          {hasOnshapeId && (
            <>
              <a
                href={`/api/onshape/export?partId=${partId}&format=stl`}
                className="px-2.5 py-1 text-xs font-medium bg-gray-700 border border-gray-600 text-gray-200 rounded hover:bg-gray-600 transition-colors"
                title="Download STL file (may take 5–15s)"
              >
                STL
              </a>
              <a
                href={`/api/onshape/export?partId=${partId}&format=step`}
                className="px-2.5 py-1 text-xs font-medium bg-gray-700 border border-gray-600 text-gray-200 rounded hover:bg-gray-600 transition-colors"
                title="Download STEP file (may take 5–15s)"
              >
                STEP
              </a>
            </>
          )}
          {!hasOnshapeId && (
            <span
              title="No OnShape link — export unavailable"
              className="px-2.5 py-1 text-xs font-medium bg-gray-800 border border-gray-700 text-gray-600 rounded cursor-not-allowed"
            >
              STL / STEP
            </span>
          )}
          {canMutate && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="px-2.5 py-1 text-xs font-medium bg-blue-700 text-white rounded hover:bg-blue-600 transition-colors"
            >
              + Add Process
            </button>
          )}
        </div>
      </div>

      {partManufacturing.length === 0 && !showForm && (
        <p className="text-sm text-gray-400">No manufacturing processes assigned.</p>
      )}

      {partManufacturing.length > 0 && (
        <div className="space-y-2">
          {partManufacturing.map((row) => (
            <div
              key={row.id}
              className="flex items-start justify-between gap-3 px-3 py-2 bg-gray-700/50 rounded-lg"
            >
              <div className="text-sm">
                <span className="font-medium text-gray-100">
                  {row.process?.name ?? 'Unknown Process'}
                </span>
                {row.outsourced && (
                  <span className="ml-2 text-xs bg-amber-900/40 text-amber-300 border border-amber-700 px-1.5 py-0.5 rounded-full">
                    Outsourced
                  </span>
                )}
                {row.outsourced && row.vendor && (
                  <span className="ml-1 text-xs text-gray-400">— {row.vendor}</span>
                )}
                {row.notes && <p className="mt-0.5 text-xs text-gray-400">{row.notes}</p>}
              </div>
              {canMutate && (
                <button
                  onClick={() => handleRemove(row.id)}
                  disabled={isPending}
                  className="text-gray-500 hover:text-red-400 text-xs transition-colors shrink-0"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && canMutate && (
        <form action={handleAdd} className="space-y-3 pt-2 border-t border-gray-700">
          {error && (
            <p className="text-sm text-red-300 bg-red-900/30 border border-red-700 rounded px-3 py-2">
              {error}
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Process</label>
            <select
              name="process_id"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select process —</option>
              {processes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={outsourced}
              onChange={(e) => setOutsourced(e.target.checked)}
              className="rounded border-gray-600 bg-gray-900 text-blue-600"
            />
            Outsourced
          </label>
          {outsourced && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Vendor</label>
              <input
                type="text"
                name="vendor"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Vendor name"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Notes (optional)</label>
            <input
              type="text"
              name="notes"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 0.2mm layer height"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-3 py-1.5 bg-gray-700 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
