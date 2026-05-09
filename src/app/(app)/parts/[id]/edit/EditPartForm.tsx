'use client';

import { useState } from 'react';
import Link from 'next/link';
import { updatePart } from '@/app/actions/parts';
import { DEFAULT_COTS_VENDORS } from '@/lib/types';

interface Props {
  part: {
    id: string;
    part_number: string | null;
    name: string;
    description: string | null;
    type: 'manufactured' | 'off_shelf';
    cad_link: string | null;
    assigned_to: string | null;
    assembly_id: string;
    onshape_part_id: string | null;
    onshape_element_id: string | null;
  };
  bom: {
    onshape_quantity: number;
    cots_quantity_spare: number;
    cots_vendor: string | null;
    cots_supplier_part_number: string | null;
    cots_purchase_link: string | null;
  } | null;
  teamMembers: { id: string; name: string }[];
  assemblies: { id: string; assembly_number: string; name: string }[];
  likePartCount: number;
}

export default function EditPartForm({ part, bom, teamMembers, assemblies, likePartCount }: Props) {
  const [type, setType] = useState<'manufactured' | 'off_shelf'>(part.type);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isOnshape = !!(part.onshape_part_id && part.onshape_element_id);
  const isOTS = type === 'off_shelf';

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set('type', type);
    const result = await updatePart(part.id, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/parts/${part.id}`} className="text-gray-400 hover:text-gray-300 text-sm">
          ← Back
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold text-gray-100">
          Edit{' '}
          {part.part_number
            ? <span className="font-mono text-blue-400">{part.part_number}</span>
            : 'Part'}
        </h1>
        {isOnshape && (
          <span className="text-xs font-mono bg-cyan-900/40 text-cyan-300 border border-cyan-700 px-2 py-0.5 rounded-full">
            OS Imported
          </span>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 text-red-300 text-sm border border-red-700">
              {error}
            </div>
          )}

          {/* Part Type — always editable */}
          <div>
            <label className="block text-sm font-medium text-gray-200 mb-2">Part Type</label>
            <div className="flex gap-3">
              {(['manufactured', 'off_shelf'] as const).map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    type === t
                      ? 'border-blue-500 bg-blue-900/30 text-blue-300'
                      : 'border-gray-600 bg-gray-900 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={type === t}
                    onChange={() => setType(t)}
                  />
                  {t === 'manufactured' ? 'Manufactured' : 'Off-the-shelf'}
                </label>
              ))}
            </div>
          </div>

          {/* Assembly */}
          <div>
            <label htmlFor="assembly_id" className="block text-sm font-medium text-gray-200 mb-1">
              Assembly
            </label>
            <select
              id="assembly_id"
              name="assembly_id"
              defaultValue={part.assembly_id}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            >
              {assemblies.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.assembly_number} — {a.name}
                </option>
              ))}
            </select>
          </div>

          {/* Part Number — editable for all parts */}
          <div>
            <label htmlFor="part_number" className="block text-sm font-medium text-gray-200 mb-1">
              Part Number
              {isOTS && <span className="text-gray-500 text-xs ml-2">(optional for off-shelf)</span>}
            </label>
            <input
              id="part_number"
              name="part_number"
              type="text"
              defaultValue={part.part_number ?? ''}
              placeholder={isOTS ? 'e.g. WCP-0123 (optional)' : 'e.g. 26_P_202'}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100 font-mono"
            />
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-200 mb-1">
              {isOTS ? 'Part Name / Description' : 'Part Name'}{' '}
              <span className="text-red-400">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={part.name}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-200 mb-1">
              Notes
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={part.description ?? ''}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-900 text-gray-100"
            />
          </div>

          {/* Quantities */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-200 mb-1">
                Qty Required
              </label>
              <div
                title="Quantity is assembly-specific. Edit it directly on the assembly page."
                className="group relative"
              >
                <input
                  type="number"
                  value={bom?.onshape_quantity ?? 1}
                  readOnly
                  disabled
                  className="w-full px-3 py-2 border border-gray-700 rounded-lg text-sm bg-gray-900/50 text-gray-500 cursor-not-allowed"
                />
                <span className="pointer-events-none absolute inset-0 flex items-center justify-end pr-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs text-gray-400 bg-gray-800 border border-gray-600 rounded px-2 py-1 whitespace-nowrap -translate-x-2">
                    Edit on the assembly page
                  </span>
                </span>
              </div>
            </div>
            <div>
              <label htmlFor="spare_quantity" className="block text-sm font-medium text-gray-200 mb-1">
                Spare Qty
              </label>
              <input
                id="spare_quantity"
                name="spare_quantity"
                type="number"
                min={0}
                defaultValue={bom?.cots_quantity_spare ?? 0}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
              />
            </div>
          </div>

          {/* COTS fields — shown for off_shelf */}
          {isOTS && (
            <>
              <div>
                <label htmlFor="cots_vendor" className="block text-sm font-medium text-gray-200 mb-1">
                  Vendor
                </label>
                <select
                  id="cots_vendor"
                  name="cots_vendor"
                  defaultValue={bom?.cots_vendor ?? ''}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
                >
                  <option value="">Select vendor…</option>
                  {DEFAULT_COTS_VENDORS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="cots_supplier_part_number" className="block text-sm font-medium text-gray-200 mb-1">
                  Supplier Part Number
                </label>
                <input
                  id="cots_supplier_part_number"
                  name="cots_supplier_part_number"
                  type="text"
                  defaultValue={bom?.cots_supplier_part_number ?? ''}
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
                />
              </div>

              <div>
                <label htmlFor="cots_purchase_link" className="block text-sm font-medium text-gray-200 mb-1">
                  Purchase Link
                </label>
                <input
                  id="cots_purchase_link"
                  name="cots_purchase_link"
                  type="url"
                  defaultValue={bom?.cots_purchase_link ?? ''}
                  placeholder="https://…"
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
                />
              </div>
            </>
          )}

          {/* CAD / OnShape link — always editable */}
          <div>
            <label htmlFor="cad_link" className="block text-sm font-medium text-gray-200 mb-1">
              {isOnshape ? 'OnShape Link' : 'CAD Link'}
              <span className="text-gray-500 text-xs ml-2">(optional)</span>
            </label>
            <input
              id="cad_link"
              name="cad_link"
              type="url"
              defaultValue={part.cad_link ?? ''}
              placeholder="https://cad.onshape.com/…"
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            />
          </div>

          {/* Assign To */}
          <div>
            <label htmlFor="assigned_to" className="block text-sm font-medium text-gray-200 mb-1">
              Assign To
            </label>
            <select
              id="assigned_to"
              name="assigned_to"
              defaultValue={part.assigned_to ?? ''}
              className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
            >
              <option value="">Unassigned</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Propagate to like parts (OnShape-imported parts only) */}
          {isOnshape && likePartCount > 0 && (
            <label className="flex items-start gap-3 p-3 rounded-lg border border-cyan-700 bg-cyan-900/20 cursor-pointer">
              <input
                type="checkbox"
                name="propagate"
                value="true"
                className="mt-0.5 accent-cyan-400"
              />
              <span className="text-sm text-cyan-200">
                Apply all changes to{' '}
                <span className="font-semibold">{likePartCount}</span> other identical part
                {likePartCount !== 1 ? 's' : ''} in this project
              </span>
            </label>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
            <Link
              href={`/parts/${part.id}`}
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
