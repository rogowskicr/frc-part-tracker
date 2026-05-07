import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import type { PartStatus } from '@/lib/types';

export default async function AssemblyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: assembly } = await supabase
    .from('assemblies')
    .select(
      `
      id, assembly_number, name, description, cad_link, created_at,
      parent:parent_assembly_id(id, assembly_number, name)
    `
    )
    .eq('id', id)
    .single();

  if (!assembly) notFound();

  const { data: parts } = await supabase
    .from('parts')
    .select(
      `
      id, part_number, name, type, status, naming_flagged, assigned_to,
      assigned_user:assigned_to(name),
      bom_items(onshape_quantity, cots_quantity_spare, cots_vendor, cots_purchase_link)
    `
    )
    .eq('assembly_id', id)
    .order('part_number', { ascending: true });

  const parent = assembly.parent as unknown as { id: string; assembly_number: string; name: string } | null;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/assemblies" className="hover:text-gray-700">
          Assemblies
        </Link>
        <span>›</span>
        {parent && (
          <>
            <Link href={`/assemblies/${parent.id}`} className="hover:text-gray-700">
              {parent.assembly_number}
            </Link>
            <span>›</span>
          </>
        )}
        <span className="font-mono font-semibold text-blue-700">{assembly.assembly_number}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
              {assembly.assembly_number}
            </span>
            <h1 className="text-2xl font-bold text-gray-900">{assembly.name}</h1>
          </div>
          {assembly.description && (
            <p className="mt-2 text-gray-600">{assembly.description}</p>
          )}
          {assembly.cad_link && (
            <a
              href={assembly.cad_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              🔗 Open in CAD
            </a>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/parts/new?assembly=${id}`}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add Part
          </Link>
          <Link
            href={`/assemblies/new?parent=${id}`}
            className="px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            + Sub-Assembly
          </Link>
        </div>
      </div>

      {/* Parts table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Parts <span className="text-gray-400 font-normal ml-1">{parts?.length ?? 0}</span>
          </h2>
        </div>

        {!parts || parts.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No parts yet.{' '}
            <Link href={`/parts/new?assembly=${id}`} className="text-blue-600 hover:text-blue-700">
              Add the first part
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {parts.map((part) => {
              const bom = (part.bom_items as Array<{
                onshape_quantity: number;
                cots_quantity_spare: number;
                cots_vendor: string | null;
                cots_purchase_link: string | null;
              }>)?.[0];
              const assignedUser = part.assigned_user as unknown as { name: string } | null;

              return (
                <div key={part.id} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {part.part_number && (
                          <span className="font-mono text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
                            {part.part_number}
                          </span>
                        )}
                        <Link
                          href={`/parts/${part.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate"
                        >
                          {part.name}
                        </Link>
                        {part.naming_flagged && (
                          <span title="Name may not conform to part number format" className="text-yellow-500 text-xs shrink-0">
                            ⚠
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400 capitalize">
                          {part.type === 'off_shelf' ? 'Off-shelf' : 'Manufactured'}
                        </span>
                        {bom && (
                          <span className="text-xs text-gray-400">Qty: {bom.onshape_quantity}</span>
                        )}
                        {bom?.cots_vendor && (
                          <span className="text-xs text-gray-400">{bom.cots_vendor}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {assignedUser && (
                      <span className="text-xs text-gray-500 hidden sm:block">{assignedUser.name}</span>
                    )}
                    <StatusBadge status={part.status as PartStatus} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
