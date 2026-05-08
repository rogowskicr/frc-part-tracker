'use client';

import { useState } from 'react';
import Link from 'next/link';
import { updateAssembly } from '@/app/actions/assemblies';

interface Props {
  assembly: {
    id: string;
    assembly_number: string;
    name: string;
    description: string | null;
    cad_link: string | null;
    parent_assembly_id: string | null;
  };
  assemblies: { id: string; assembly_number: string; name: string }[];
}

export default function EditAssemblyForm({ assembly, assemblies }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await updateAssembly(assembly.id, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/assemblies/${assembly.id}`} className="text-gray-400 hover:text-gray-300 text-sm">
          ← Back
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold text-gray-100">
          Edit <span className="font-mono text-blue-400">{assembly.assembly_number}</span>
        </h1>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 text-red-300 text-sm border border-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">Assembly Number</label>
            <p className="font-mono text-sm text-gray-300 px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg">
              {assembly.assembly_number}
            </p>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-200 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={assembly.name}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-200 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={assembly.description ?? ''}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-900 text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="cad_link" className="block text-sm font-medium text-gray-200 mb-1">
              CAD Link
            </label>
            <input
              id="cad_link"
              name="cad_link"
              type="url"
              defaultValue={assembly.cad_link ?? ''}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="parent_assembly_id" className="block text-sm font-medium text-gray-200 mb-1">
              Parent Assembly
            </label>
            <select
              id="parent_assembly_id"
              name="parent_assembly_id"
              defaultValue={assembly.parent_assembly_id ?? ''}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            >
              <option value="">None (top-level)</option>
              {assemblies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assembly_number} — {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <Link
              href={`/assemblies/${assembly.id}`}
              className="px-5 py-2 bg-gray-900 border border-gray-600 text-gray-200 rounded-lg font-medium text-sm hover:bg-gray-700 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
