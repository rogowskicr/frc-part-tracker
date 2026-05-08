'use client';

import { useState } from 'react';
import { deleteAssembly } from '@/app/actions/assemblies';

export default function DeleteAssemblyButton({ assemblyId }: { assemblyId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm('Delete this assembly and all its parts? This cannot be undone.')) return;
    setLoading(true);
    await deleteAssembly(assemblyId);
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="px-3 py-2 bg-red-900/40 border border-red-700 text-red-300 rounded-lg text-sm font-medium hover:bg-red-900/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading ? 'Deleting…' : 'Delete'}
    </button>
  );
}
