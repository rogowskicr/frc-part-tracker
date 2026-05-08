'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createPart } from '@/app/actions/parts';
import { validatePartNumber, defaultProjectCode } from '@/lib/validation';
import { DEFAULT_COTS_VENDORS } from '@/lib/types';

async function fetchActiveCode(): Promise<string> {
  try {
    const res = await fetch('/api/active-season');
    if (res.ok) {
      const { code } = await res.json();
      if (code) return code;
    }
  } catch {
    // fall through to default
  }
  return defaultProjectCode();
}

interface Assembly {
  id: string;
  assembly_number: string;
  name: string;
}

interface TeamMember {
  id: string;
  name: string;
}

interface Props {
  searchParams: Promise<{ assembly?: string }>;
}

export default function NewPartPage({ searchParams }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [assemblies, setAssemblies] = useState<Assembly[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [partType, setPartType] = useState<'manufactured' | 'off_shelf'>('manufactured');
  const [partNumber, setPartNumber] = useState('');
  const [numberError, setNumberError] = useState<string | null>(null);
  const [selectedAssembly, setSelectedAssembly] = useState('');
  const [activeCode, setActiveCode] = useState<string>(defaultProjectCode());

  useEffect(() => {
    async function load() {
      const [assemblyRes, memberRes, spRes, code] = await Promise.all([
        fetch('/api/assemblies'),
        fetch('/api/team-members'),
        searchParams,
        fetchActiveCode(),
      ]);
      setActiveCode(code);

      if (assemblyRes.ok) {
        const data: Assembly[] = await assemblyRes.json();
        setAssemblies(data);

        const preselect = spRes.assembly;
        const defaultAssembly = preselect
          ? data.find((a) => a.id === preselect)
          : data[0];

        if (defaultAssembly) {
          setSelectedAssembly(defaultAssembly.id);
          suggestPartNumber(defaultAssembly.assembly_number);
        }
      }

      if (memberRes.ok) {
        const data: TeamMember[] = await memberRes.json();
        setTeamMembers(data);
      }
    }
    load();
  }, []);

  async function suggestPartNumber(assemblyNumber: string) {
    if (!assemblyNumber) return;
    const res = await fetch(`/api/next-part-number?assembly=${encodeURIComponent(assemblyNumber)}`);
    if (res.ok) {
      const { number } = await res.json();
      setPartNumber(number);
    }
  }

  async function handleAssemblyChange(assemblyId: string) {
    setSelectedAssembly(assemblyId);
    const assembly = assemblies.find((a) => a.id === assemblyId);
    if (assembly && partType === 'manufactured') {
      await suggestPartNumber(assembly.assembly_number);
    }
  }

  function handleNumberChange(val: string) {
    setPartNumber(val);
    if (partType === 'manufactured') {
      const err = validatePartNumber(val.trim().toUpperCase());
      setNumberError(err);
    }
  }

  async function handleSubmit(formData: FormData) {
    if (partType === 'manufactured') {
      const err = validatePartNumber(partNumber.trim().toUpperCase());
      if (err) {
        setNumberError(err);
        return;
      }
    }
    setLoading(true);
    setError(null);
    formData.set('type', partType);
    if (partType === 'manufactured') {
      formData.set('part_number', partNumber.toUpperCase());
    }
    const result = await createPart(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/parts" className="text-gray-400 hover:text-gray-300 text-sm">
          ← Parts
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold text-gray-100">New Part</h1>
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 text-red-300 text-sm border border-red-700">
              {error}
            </div>
          )}

          {/* Part type toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">Part Type</label>
            <div className="flex gap-2">
              {(['manufactured', 'off_shelf'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPartType(t)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                    partType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-900 text-gray-200 border-gray-600 hover:bg-gray-700'
                  }`}
                >
                  {t === 'manufactured' ? '🔧 Manufactured' : '🛒 Off-the-Shelf'}
                </button>
              ))}
            </div>
          </div>

          {/* Assembly */}
          <div>
            <label htmlFor="assembly_id" className="block text-sm font-medium text-gray-200 mb-1">
              Assembly <span className="text-red-400">*</span>
            </label>
            <select
              id="assembly_id"
              name="assembly_id"
              required
              value={selectedAssembly}
              onChange={(e) => handleAssemblyChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            >
              <option value="">Select assembly…</option>
              {assemblies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assembly_number} — {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Part number — manufactured only */}
          {partType === 'manufactured' && (
            <div>
              <label htmlFor="part_number" className="block text-sm font-medium text-gray-200 mb-1">
                Part Number <span className="text-red-400">*</span>
              </label>
              <input
                id="part_number"
                name="part_number"
                type="text"
                value={partNumber}
                onChange={(e) => handleNumberChange(e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase bg-gray-900 text-gray-100 placeholder-gray-500 ${
                  numberError ? 'border-red-500' : 'border-gray-600'
                }`}
                placeholder={`${activeCode}_P_101`}
              />
              {numberError ? (
                <p className="mt-1 text-xs text-red-600">{numberError}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-400">Format: {activeCode}_P_NNN</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-200 mb-1">
              {partType === 'off_shelf' ? 'Part Name / Description' : 'Part Name'}{' '}
              <span className="text-red-400">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-900 text-gray-100 placeholder-gray-500"
              placeholder={partType === 'off_shelf' ? 'e.g. 1/4-20 Hex Bolt' : 'e.g. Gearbox Bracket'}
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-200 mb-1">
              Notes
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-900 text-gray-100 placeholder-gray-500"
              placeholder="Optional notes"
            />
          </div>

          {/* Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-200 mb-1">
                Quantity Required
              </label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                defaultValue={1}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="spare_quantity" className="block text-sm font-medium text-gray-200 mb-1">
                Spare Quantity
              </label>
              <input
                id="spare_quantity"
                name="spare_quantity"
                type="number"
                min={0}
                defaultValue={0}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
              />
            </div>
          </div>

          {/* COTS-specific fields */}
          {partType === 'off_shelf' && (
            <>
              <div>
                <label htmlFor="cots_vendor" className="block text-sm font-medium text-gray-200 mb-1">
                  Vendor
                </label>
                <select
                  id="cots_vendor"
                  name="cots_vendor"
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
                >
                  <option value="">Select vendor…</option>
                  {DEFAULT_COTS_VENDORS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="cots_supplier_part_number"
                  className="block text-sm font-medium text-gray-200 mb-1"
                >
                  Supplier Part Number
                </label>
                <input
                  id="cots_supplier_part_number"
                  name="cots_supplier_part_number"
                  type="text"
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100 placeholder-gray-500"
                  placeholder="e.g. AM-0447"
                />
              </div>

              <div>
                <label
                  htmlFor="cots_purchase_link"
                  className="block text-sm font-medium text-gray-200 mb-1"
                >
                  Purchase Link
                </label>
                <input
                  id="cots_purchase_link"
                  name="cots_purchase_link"
                  type="url"
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100 placeholder-gray-500"
                  placeholder="https://www.andymark.com/..."
                />
              </div>
            </>
          )}

          {/* CAD link — manufactured only */}
          {partType === 'manufactured' && (
            <div>
              <label htmlFor="cad_link" className="block text-sm font-medium text-gray-200 mb-1">
                CAD Link
              </label>
              <input
                id="cad_link"
                name="cad_link"
                type="url"
                className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100 placeholder-gray-500"
                placeholder="https://cad.onshape.com/..."
              />
            </div>
          )}

          {/* Assign to */}
          <div>
            <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-200 mb-1">
              Assign To
            </label>
            <select
              id="assigned_to"
              name="assigned_to"
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || (partType === 'manufactured' && !!numberError)}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating…' : 'Create Part'}
            </button>
            <Link
              href="/parts"
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
