'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createAssembly } from '@/app/actions/assemblies';
import { validateAssemblyNumber, getSeasonYY, getCurrentSeasonYear } from '@/lib/validation';

interface Assembly {
  id: string;
  assembly_number: string;
  name: string;
}

interface Props {
  searchParams: { parent?: string };
}

export default function NewAssemblyPage({ searchParams }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [assemblyNumber, setAssemblyNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);

  const yy = getSeasonYY();
  const year = getCurrentSeasonYear();

  // Fetch existing assemblies for parent dropdown + suggested number
  useEffect(() => {
    async function load() {
      const res = await fetch('/api/assemblies');
      if (res.ok) {
        const data = await res.json();
        setAssemblies(data);
        // Auto-suggest next number
        const { nextTopLevelAssemblyNumber } = await import('@/lib/validation');
        const suggested = nextTopLevelAssemblyNumber(
          year,
          data.map((a: Assembly) => a.assembly_number)
        );
        setAssemblyNumber(suggested);
      }
    }
    load();
  }, [year]);

  function handleNumberChange(val: string) {
    setAssemblyNumber(val);
    const err = validateAssemblyNumber(val.trim().toUpperCase());
    setNumberError(err);
  }

  async function handleSubmit(formData: FormData) {
    const err = validateAssemblyNumber(assemblyNumber.trim().toUpperCase());
    if (err) {
      setNumberError(err);
      return;
    }
    setLoading(true);
    setError(null);
    formData.set('assembly_number', assemblyNumber.toUpperCase());
    const result = await createAssembly(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assemblies" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Assemblies
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">New Assembly</h1>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="assembly_number" className="block text-sm font-medium text-gray-700 mb-1">
              Assembly Number <span className="text-red-500">*</span>
            </label>
            <input
              id="assembly_number"
              name="assembly_number"
              type="text"
              required
              value={assemblyNumber}
              onChange={(e) => handleNumberChange(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase ${
                numberError ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder={`${yy}_A_100`}
            />
            {numberError ? (
              <p className="mt-1 text-xs text-red-600">{numberError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Format: {yy}_A_NNN — top-level assemblies use multiples of 100
              </p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Drivetrain Assembly"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Optional description"
            />
          </div>

          <div>
            <label htmlFor="cad_link" className="block text-sm font-medium text-gray-700 mb-1">
              CAD Link
            </label>
            <input
              id="cad_link"
              name="cad_link"
              type="url"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="https://cad.onshape.com/..."
            />
          </div>

          <div>
            <label htmlFor="parent_assembly_id" className="block text-sm font-medium text-gray-700 mb-1">
              Parent Assembly
            </label>
            <select
              id="parent_assembly_id"
              name="parent_assembly_id"
              defaultValue={searchParams?.parent ?? ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
              disabled={loading || !!numberError}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating…' : 'Create Assembly'}
            </button>
            <Link
              href="/assemblies"
              className="px-5 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
