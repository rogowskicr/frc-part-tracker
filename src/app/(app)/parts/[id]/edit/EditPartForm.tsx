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
  };
  bom: {
    onshape_quantity: number;
    cots_quantity_spare: number;
    cots_vendor: string | null;
    cots_supplier_part_number: string | null;
    cots_purchase_link: string | null;
  } | null;
  teamMembers: { id: string; name: string }[];
}

export default function EditPartForm({ part, bom, teamMembers }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set('type', part.type);
    const result = await updatePart(part.id, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const isOTS = part.type === 'off_shelf';

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/parts/${part.id}`} className="text-gray-400 hover:text-gray-300 text-sm">
          ← Back
        </Link>
        <span className="text-gray-600">/</span>
        <h1 className="text-xl font-bold text-gray-100">
          Edit {part.part_number ? <span className="font-mono text-blue-400">{part.part_number}</span> : 'Part'}
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
            <label htmlFor="name" className="block text-sm font-medium text-gray-200 mb-1">
              {isOTS ? 'Part Name / Description' : 'Part Name'} <span className="text-red-400">*</span>
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
                defaultValue={bom?.onshape_quantity ?? 1}
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
                defaultValue={bom?.cots_quantity_spare ?? 0}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
              />
            </div>
          </div>

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
                  className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
                />
              </div>
            </>
          )}

          {!isOTS && (
            <div>
              <label htmlFor="cad_link" className="block text-sm font-medium text-gray-200 mb-1">
                CAD Link
              </label>
              <input
                id="cad_link"
                name="cad_link"
                type="url"
                defaultValue={part.cad_link ?? ''}
                className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-900 text-gray-100"
              />
            </div>
          )}

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
