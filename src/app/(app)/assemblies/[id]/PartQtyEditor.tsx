'use client';

import { useState, useRef } from 'react';
import { updatePartBomQuantity } from '@/app/actions/parts';

interface Props {
  partId: string;
  assemblyId: string;
  quantity: number;
  canMutate: boolean;
}

export default function PartQtyEditor({ partId, assemblyId, quantity, canMutate }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(quantity));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    if (!canMutate) return;
    setValue(String(quantity));
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function save() {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1) { setError('Must be ≥ 1'); return; }
    if (n === quantity) { setEditing(false); return; }
    setSaving(true);
    setError('');
    const result = await updatePartBomQuantity(partId, assemblyId, n);
    setSaving(false);
    if (result?.error) {
      setError(result.error);
    } else {
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        title={canMutate ? 'Click to edit quantity' : undefined}
        className={`text-xs text-gray-500 ${canMutate ? 'hover:text-gray-300 cursor-pointer' : 'cursor-default'}`}
      >
        Qty: {quantity}
        {canMutate && <span className="ml-0.5 text-gray-600">✎</span>}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-xs text-gray-500">Qty:</span>
      <input
        ref={inputRef}
        type="number"
        min={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className="w-14 px-1.5 py-0.5 text-xs bg-gray-700 border border-blue-500 rounded text-gray-100 focus:outline-none"
        autoFocus
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
      >
        {saving ? '…' : '✓'}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="text-xs text-gray-500 hover:text-gray-300"
      >
        ✕
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
