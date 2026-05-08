'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { createAssembly } from '@/app/actions/assemblies';
import { validateAssemblyNumber, defaultProjectCode } from '@/lib/validation';

async function fetchActiveCode(): Promise<string | null> {
  try {
    const res = await fetch('/api/active-season');
    if (res.ok) {
      const { code } = await res.json();
      return code ?? null;
    }
  } catch {
    // fall through
  }
  return null;
}

interface Assembly {
  id: string;
  assembly_number: string;
  name: string;
}

interface Props {
  searchParams: Promise<{ parent?: string }>;
}

export default function NewAssemblyPage({ searchParams }: Props) {
  const { parent } = use(searchParams);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(false);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [assemblyNumber, setAssemblyNumber] = useState('');
  const [numberSuffix, setNumberSuffix]     = useState('');
  const [numberError, setNumberError]       = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);

  const lockedPrefix = activeCode ? `${activeCode}_A_` : null;

  useEffect(() => {
    async function load() {
      const [code, res] = await Promise.all([
        fetchActiveCode(),
        fetch('/api/assemblies'),
      ]);
      setActiveCode(code);
      if (res.ok) {
        const data: Assembly[] = await res.json();
        setAssemblies(data);
        const { nextTopLevelAssemblyNumber } = await import('@/lib/validation');
        const effectiveCode = code ?? defaultProjectCode();
        const suggested = nextTopLevelAssemblyNumber(effectiveCode, data.map((a) => a.assembly_number));
        setAssemblyNumber(suggested);
        if (code) {
          // Extract just the NNN part for the suffix input
          const prefix = `${code}_A_`;
          setNumberSuffix(suggested.startsWith(prefix) ? suggested.slice(prefix.length) : suggested.split('_').pop() ?? '');
        }
      }
    }
    load();
  }, []);

  function handleSuffixChange(val: string) {
    const cleaned = val.replace(/\D/g, '');
    setNumberSuffix(cleaned);
    const full = lockedPrefix ? `${lockedPrefix}${cleaned}` : cleaned;
    setAssemblyNumber(full.toUpperCase());
    const err = validateAssemblyNumber(full.trim().toUpperCase());
    setNumberError(err);
  }

  function handleFreeNumberChange(val: string) {
    setAssemblyNumber(val);
    const err = validateAssemblyNumber(val.trim().toUpperCase());
    setNumberError(err);
  }

  async function handleSubmit(formData: FormData) {
    const full = (lockedPrefix ? `${lockedPrefix}${numberSuffix}` : assemblyNumber).toUpperCase();
    const err = validateAssemblyNumber(full.trim());
    if (err) {
      setNumberError(err);
      return;
    }
    setLoading(true);
    setError(null);
    formData.set('assembly_number', full);
    const result = await createAssembly(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assemblies" className="text-gray-400 hover:text-gray-300 text-sm">
          ← Assemblies
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold text-gray-100">New Assembly</h1>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 text-red-300 text-sm border border-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="assembly_number" className="block text-sm font-medium text-gray-200 mb-1">
              Assembly Number <span className="text-red-400">*</span>
            </label>
            {lockedPrefix ? (
              <div className={`flex items-center border rounded-lg overflow-hidden font-mono text-sm ${numberError ? 'border-red-500' : 'border-gray-600'}`}>
                <span className="px-3 py-2 bg-gray-700 text-gray-400 border-r border-gray-600 shrink-0 select-none">
                  {lockedPrefix}
                </span>
                <input
                  id="assembly_number"
                  type="text"
                  inputMode="numeric"
                  value={numberSuffix}
                  onChange={(e) => handleSuffixChange(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-900 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset uppercase"
                  placeholder="100"
                />
              </div>
            ) : (
              <input
                id="assembly_number"
                name="assembly_number"
                type="text"
                required
                value={assemblyNumber}
                onChange={(e) => handleFreeNumberChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase bg-gray-900 text-gray-100 placeholder-gray-500 ${
                  numberError ? 'border-red-500' : 'border-gray-600'
                }`}
                placeholder={`${defaultProjectCode()}_A_100`}
              />
            )}
            {numberError ? (
              <p className="mt-1 text-xs text-red-400">{numberError}</p>
            ) : (
              <p className="mt-1 text-xs text-gray-400">
                {lockedPrefix
                  ? `Top-level assemblies use multiples of 100 (e.g. 100, 200)`
                  : `Format: YY_A_NNN — top-level assemblies use multiples of 100`}
              </p>
            )}
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
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-900 text-gray-100 placeholder-gray-500"
              placeholder="Drivetrain Assembly"
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
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-gray-900 text-gray-100 placeholder-gray-500"
              placeholder="Optional description"
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
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-900 text-gray-100 placeholder-gray-500"
              placeholder="https://cad.onshape.com/..."
            />
          </div>

          <div>
            <label htmlFor="parent_assembly_id" className="block text-sm font-medium text-gray-200 mb-1">
              Parent Assembly
            </label>
            <select
              id="parent_assembly_id"
              name="parent_assembly_id"
              defaultValue={parent ?? ''}
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
              disabled={loading || !!numberError}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating…' : 'Create Assembly'}
            </button>
            <Link
              href="/assemblies"
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
