import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import OrdersClient from './OrdersClient';
import type { OrderLine, VendorGroup } from './OrdersClient';

export default async function OrdersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, active_project_code, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return <div className="text-gray-400 py-8">No team assigned.</div>;

  const activeCode = profile.active_project_code ?? null;
  const canEdit = profile.role !== 'viewer';

  if (!activeCode) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-100">COTS Orders</h1>
        <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
          <span className="text-4xl">📦</span>
          <h3 className="mt-4 text-lg font-medium text-gray-100">No active project</h3>
          <p className="mt-2 text-gray-400 text-sm">
            Select a project on the{' '}
            <Link href={`/team/${profile.team_id}`} className="text-blue-400 hover:underline">
              Team page
            </Link>{' '}
            to view orders.
          </p>
        </div>
      </div>
    );
  }

  // Get all assembly IDs for this project
  const { data: projectAssemblies } = await supabase
    .from('assemblies')
    .select('id')
    .eq('team_id', profile.team_id)
    .gte('assembly_number', `${activeCode}_`)
    .lt('assembly_number', activeCode + '\x60');

  const projectAssemblyIds = (projectAssemblies ?? []).map((a) => a.id);

  // Fetch all COTS parts in this project
  let query = supabase
    .from('parts')
    .select(
      `id, name, part_number, type,
       onshape_element_id,
       assembly:assembly_id(id, assembly_number, name),
       bom_items(onshape_quantity, cots_quantity_spare, cots_vendor, cots_supplier_part_number, cots_purchase_link, cots_received)`
    )
    .eq('team_id', profile.team_id)
    .eq('type', 'off_shelf');

  if (projectAssemblyIds.length === 0) {
    query = query.in('assembly_id', ['00000000-0000-0000-0000-000000000000']);
  } else {
    query = query.in('assembly_id', projectAssemblyIds);
  }

  const { data: rawParts } = await query;

  // Fetch existing order statuses for this project
  const { data: orderRecords } = await supabase
    .from('cots_orders')
    .select('vendor, status')
    .eq('team_id', profile.team_id)
    .eq('project_code', activeCode);

  const orderStatusByVendor = new Map<string, 'pending' | 'ordered' | 'received'>(
    (orderRecords ?? []).map((r) => [r.vendor, r.status as 'pending' | 'ordered' | 'received'])
  );

  // ── Deduplicate COTS parts ──────────────────────────────────────────────────
  type AssemblyRef = { id: string; assembly_number: string; name: string };

  const grouped = new Map<string, OrderLine>();

  for (const part of rawParts ?? []) {
    const bom = (
      part.bom_items as Array<{
        onshape_quantity: number;
        cots_quantity_spare: number;
        cots_vendor: string | null;
        cots_supplier_part_number: string | null;
        cots_purchase_link: string | null;
        cots_received: boolean;
      }>
    )?.[0];

    const assembly = part.assembly as unknown as AssemblyRef | null;
    const vendor = bom?.cots_vendor?.trim() || null;
    const supplierPn = bom?.cots_supplier_part_number?.trim() || null;
    const name = part.name.trim();

    // Key by name+supplierPN when supplier PN is populated, else name-only
    const key = supplierPn
      ? `${name.toLowerCase()}::${supplierPn.toLowerCase()}`
      : name.toLowerCase();

    const existing = grouped.get(key);
    if (existing) {
      existing.part_ids.push(part.id);
      existing.total_required += bom?.onshape_quantity ?? 0;
      existing.total_spare += bom?.cots_quantity_spare ?? 0;
      if (assembly && !existing.assembly_list.some((a) => a.id === assembly.id)) {
        existing.assembly_list.push(assembly);
      }
      if (bom?.cots_received) existing.received = true;
      if (!existing.cots_vendor && vendor) existing.cots_vendor = vendor;
      if (!existing.cots_purchase_link && bom?.cots_purchase_link) {
        existing.cots_purchase_link = bom.cots_purchase_link;
      }
    } else {
      grouped.set(key, {
        name,
        part_ids: [part.id],
        part_number: part.part_number ?? null,
        cots_vendor: vendor,
        cots_supplier_part_number: supplierPn,
        cots_purchase_link: bom?.cots_purchase_link ?? null,
        total_required: bom?.onshape_quantity ?? 0,
        total_spare: bom?.cots_quantity_spare ?? 0,
        assembly_list: assembly ? [assembly] : [],
        received: bom?.cots_received ?? false,
        missing_info: !vendor || !supplierPn,
      });
    }
  }

  const allLines = Array.from(grouped.values());

  // Split: fully-info'd lines grouped by vendor; missing-info lines separate
  const linesByVendor = new Map<string, OrderLine[]>();
  const needsInfoLines: OrderLine[] = [];

  for (const line of allLines) {
    if (line.missing_info) {
      needsInfoLines.push(line);
    } else {
      const v = line.cots_vendor!;
      const arr = linesByVendor.get(v);
      if (arr) {
        arr.push(line);
      } else {
        linesByVendor.set(v, [line]);
      }
    }
  }

  // Build vendor groups in the order they appear in DEFAULT_COTS_VENDORS, then any others
  const VENDOR_ORDER = ['West Coast Products', 'AndyMark', 'REV Robotics', 'ThriftyBot', 'Amazon', 'VEXpro', 'Other'];
  const vendorGroups: VendorGroup[] = [];
  const seen = new Set<string>();

  for (const v of VENDOR_ORDER) {
    if (linesByVendor.has(v)) {
      vendorGroups.push({ vendor: v, status: orderStatusByVendor.get(v) ?? 'pending', lines: linesByVendor.get(v)! });
      seen.add(v);
    }
  }
  for (const [v, lines] of linesByVendor) {
    if (!seen.has(v)) {
      vendorGroups.push({ vendor: v, status: orderStatusByVendor.get(v) ?? 'pending', lines });
    }
  }

  const totalLines = allLines.length;
  const totalUnits = allLines.reduce((s, l) => s + l.total_required + l.total_spare, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">COTS Orders</h1>
          <p className="text-gray-400 mt-1">
            {totalLines} unique part{totalLines !== 1 ? 's' : ''} · {totalUnits} total units · Project {activeCode}
          </p>
        </div>
      </div>

      <OrdersClient
        vendorGroups={vendorGroups}
        needsInfoLines={needsInfoLines}
        projectCode={activeCode}
        canEdit={canEdit}
        allLines={allLines}
      />
    </div>
  );
}
