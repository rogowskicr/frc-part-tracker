'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { validatePartNumber, checkNamingConformance } from '@/lib/validation';
import type { PartStatus } from '@/lib/types';

export async function createPart(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return { error: 'No team found' };
  if (profile.role === 'viewer') return { error: 'Viewers cannot create parts' };

  const type = formData.get('type') as 'manufactured' | 'off_shelf';
  const name = (formData.get('name') as string).trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const assembly_id = formData.get('assembly_id') as string;
  const cad_link = (formData.get('cad_link') as string | null)?.trim() || null;
  const assigned_to = (formData.get('assigned_to') as string | null) || null;

  let part_number: string | null = null;
  let naming_flagged = false;

  if (type === 'manufactured') {
    part_number = (formData.get('part_number') as string).trim().toUpperCase();
    const validationError = validatePartNumber(part_number);
    if (validationError) return { error: validationError };

    const conformance = checkNamingConformance(name, 'part');
    naming_flagged = !conformance.conforms;
  }

  const { data: part, error } = await supabase
    .from('parts')
    .insert({
      part_number,
      name,
      description,
      assembly_id,
      cad_link,
      type,
      naming_flagged,
      assigned_to: assigned_to || null,
      team_id: profile.team_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Add BOM item
  const onshape_quantity = parseInt(formData.get('quantity') as string, 10) || 1;
  const cots_quantity_spare = parseInt(formData.get('spare_quantity') as string, 10) || 0;
  const cots_supplier_part_number =
    (formData.get('cots_supplier_part_number') as string | null)?.trim() || null;
  const cots_purchase_link =
    (formData.get('cots_purchase_link') as string | null)?.trim() || null;
  const cots_vendor = (formData.get('cots_vendor') as string | null)?.trim() || null;

  await supabase.from('bom_items').insert({
    assembly_id,
    part_id: part.id,
    onshape_quantity,
    cots_quantity: type === 'off_shelf' ? onshape_quantity : null,
    cots_quantity_spare,
    cots_supplier_part_number,
    cots_purchase_link,
    cots_vendor,
  });

  // Record initial status in history
  await supabase.from('part_status_history').insert({
    part_id: part.id,
    status: 'design',
    changed_by: user.id,
  });

  revalidatePath('/parts');
  revalidatePath(`/assemblies/${assembly_id}`);
  redirect(`/parts/${part.id}`);
}

export async function updatePartStatus(partId: string, status: PartStatus, notes?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'viewer') return { error: 'Viewers cannot update part status' };

  const { error } = await supabase.from('parts').update({ status }).eq('id', partId);
  if (error) return { error: error.message };

  await supabase.from('part_status_history').insert({
    part_id: partId,
    status,
    changed_by: user.id,
    notes: notes || null,
  });

  revalidatePath(`/parts/${partId}`);
  revalidatePath('/parts');
  return { success: true };
}

export async function updatePartAssignment(partId: string, userId: string | null) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'viewer') return { error: 'Viewers cannot update assignments' };

  const { error } = await supabase
    .from('parts')
    .update({ assigned_to: userId })
    .eq('id', partId);
  if (error) return { error: error.message };
  revalidatePath(`/parts/${partId}`);
  return { success: true };
}

export async function deletePart(id: string, assemblyId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') return { error: 'Only admins can delete parts' };

  const { error } = await supabase.from('parts').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/parts');
  revalidatePath(`/assemblies/${assemblyId}`);
  redirect(`/assemblies/${assemblyId}`);
}

export async function updatePart(id: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'viewer') return { error: 'Viewers cannot edit parts' };

  const name        = (formData.get('name') as string).trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const cad_link    = (formData.get('cad_link') as string | null)?.trim() || null;
  const assigned_to = (formData.get('assigned_to') as string | null) || null;
  const type        = formData.get('type') as 'manufactured' | 'off_shelf';
  const assembly_id = (formData.get('assembly_id') as string | null) || null;
  const propagate   = formData.get('propagate') === 'true';

  // Part number: editable for all parts; validate format only for manufactured
  const rawPartNumber = (formData.get('part_number') as string | null)?.trim().toUpperCase() || null;
  let part_number = rawPartNumber || null;
  if (type === 'manufactured' && part_number) {
    const err = validatePartNumber(part_number);
    if (err) return { error: err };
  }

  let naming_flagged: boolean | undefined;
  if (type === 'manufactured') {
    naming_flagged = !checkNamingConformance(name, 'part').conforms;
  } else {
    naming_flagged = false;
  }

  const { data: existing } = await supabase
    .from('parts')
    .select('assembly_id, onshape_element_id, onshape_part_id')
    .eq('id', id)
    .single();

  const updateFields: Record<string, unknown> = {
    name, description, cad_link, type,
    assigned_to:    assigned_to || null,
    naming_flagged,
  };
  if (part_number !== undefined) updateFields.part_number = part_number;
  if (assembly_id) updateFields.assembly_id = assembly_id;

  const { error } = await supabase.from('parts').update(updateFields).eq('id', id);
  if (error) return { error: error.message };

  const cots_quantity_spare       = parseInt(formData.get('spare_quantity') as string, 10) || 0;
  const cots_vendor               = (formData.get('cots_vendor') as string | null)?.trim() || null;
  const cots_supplier_part_number = (formData.get('cots_supplier_part_number') as string | null)?.trim() || null;
  const cots_purchase_link        = (formData.get('cots_purchase_link') as string | null)?.trim() || null;

  // Quantity is assembly-specific — do not update it from the edit form.
  // Fetch the current qty so we can keep cots_quantity in sync for off_shelf parts.
  const { data: currentBom } = await supabase
    .from('bom_items')
    .select('onshape_quantity')
    .eq('part_id', id)
    .single();
  const currentQty = currentBom?.onshape_quantity ?? 1;

  const bomUpdate: Record<string, unknown> = {
    cots_quantity_spare,
    cots_vendor,
    cots_supplier_part_number,
    cots_purchase_link,
    cots_quantity: type === 'off_shelf' ? currentQty : null,
  };
  if (assembly_id) bomUpdate.assembly_id = assembly_id;
  await supabase.from('bom_items').update(bomUpdate).eq('part_id', id);

  // Propagate all part-level fields to every part sharing the same OnShape identity.
  // Assembly-specific fields (onshape_quantity, assigned_to, status, assembly_id) are NOT propagated.
  if (
    propagate &&
    profile?.team_id &&
    existing?.onshape_element_id &&
    existing?.onshape_part_id
  ) {
    const { data: likeParts } = await supabase
      .from('parts')
      .select('id')
      .eq('team_id', profile.team_id)
      .eq('onshape_element_id', existing.onshape_element_id)
      .eq('onshape_part_id', existing.onshape_part_id)
      .neq('id', id);

    if (likeParts && likeParts.length > 0) {
      const likeIds = likeParts.map((p) => p.id);

      // Propagate all part-level fields; assembly/assignment/status stay per-instance
      const propagateFields: Record<string, unknown> = {
        name, description, type, cad_link, naming_flagged,
      };
      if (part_number !== undefined) propagateFields.part_number = part_number;
      await supabase.from('parts').update(propagateFields).in('id', likeIds);

      // Update each like part's BOM metadata; preserve per-assembly onshape_quantity
      for (const likeId of likeIds) {
        const { data: likeBom } = await supabase
          .from('bom_items')
          .select('onshape_quantity')
          .eq('part_id', likeId)
          .single();

        const likeQty = likeBom?.onshape_quantity ?? 1;
        await supabase.from('bom_items').update({
          cots_vendor,
          cots_supplier_part_number,
          cots_purchase_link,
          cots_quantity_spare,
          cots_quantity: type === 'off_shelf' ? likeQty : null,
        }).eq('part_id', likeId);
      }

      // Revalidate affected assembly pages
      const { data: likeAssemblies } = await supabase
        .from('parts')
        .select('assembly_id')
        .in('id', likeIds);
      const asmIds = [...new Set((likeAssemblies ?? []).map((p) => p.assembly_id))];
      asmIds.forEach((aId) => { if (aId) revalidatePath(`/assemblies/${aId}`); });
    }
  }

  revalidatePath(`/parts/${id}`);
  revalidatePath('/parts');
  if (assembly_id && existing?.assembly_id && assembly_id !== existing.assembly_id) {
    revalidatePath(`/assemblies/${existing.assembly_id}`);
    revalidatePath(`/assemblies/${assembly_id}`);
  }
  redirect(`/parts/${id}`);
}

/** Update only the required quantity for one part within a specific assembly. */
export async function updatePartBomQuantity(partId: string, assemblyId: string, quantity: number) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') return { error: 'Viewers cannot edit quantities' };

  if (!Number.isInteger(quantity) || quantity < 1) return { error: 'Quantity must be a positive integer' };

  // Confirm the part belongs to this assembly (prevents cross-team edits)
  const { data: part } = await supabase
    .from('parts')
    .select('id, type')
    .eq('id', partId)
    .eq('assembly_id', assemblyId)
    .single();
  if (!part) return { error: 'Part not found in this assembly' };

  const { error } = await supabase
    .from('bom_items')
    .update({
      onshape_quantity: quantity,
      cots_quantity:    part.type === 'off_shelf' ? quantity : null,
    })
    .eq('part_id', partId);

  if (error) return { error: error.message };

  revalidatePath(`/assemblies/${assemblyId}`);
  return { success: true };
}

/** Toggle the quantity lock on a BOM item. Locked items are skipped by Onshape re-imports. */
export async function toggleQuantityLock(partId: string, assemblyId: string, locked: boolean) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') return { error: 'Viewers cannot lock quantities' };

  const { error } = await supabase
    .from('bom_items')
    .update({ quantity_locked: locked })
    .eq('part_id', partId)
    .eq('assembly_id', assemblyId);

  if (error) return { error: error.message };

  revalidatePath(`/assemblies/${assemblyId}`);
  return { success: true };
}

/** Update the status of every part in an assembly (and all descendant assemblies) at once. */
export async function bulkUpdateAssemblyStatus(assemblyId: string, status: PartStatus, reason: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') return { error: 'Viewers cannot update status' };

  // Collect all assembly IDs in the subtree via iterative BFS
  const assemblyIds: string[] = [assemblyId];
  const queue = [assemblyId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const { data: children } = await supabase
      .from('assemblies')
      .select('id')
      .eq('parent_assembly_id', current);
    for (const child of children ?? []) {
      assemblyIds.push(child.id);
      queue.push(child.id);
    }
  }

  // Fetch all parts in those assemblies
  const { data: parts } = await supabase
    .from('parts')
    .select('id')
    .in('assembly_id', assemblyIds);

  if (!parts || parts.length === 0) return { success: true };

  const partIds = parts.map((p) => p.id);

  const { error } = await supabase.from('parts').update({ status }).in('id', partIds);
  if (error) return { error: error.message };

  // Record history for each part
  const historyRows = partIds.map((part_id) => ({
    part_id,
    status,
    changed_by: user.id,
    notes: reason,
  }));
  await supabase.from('part_status_history').insert(historyRows);

  for (const aId of assemblyIds) {
    revalidatePath(`/assemblies/${aId}`);
  }
  revalidatePath('/parts');
  return { success: true };
}

export async function getNextPartNumber(assemblyNumber: string): Promise<string> {
  const supabase = await createClient();
  const yy = assemblyNumber.slice(0, 2);

  const { data } = await supabase
    .from('parts')
    .select('part_number')
    .like('part_number', `${yy}_P_%`);

  const { nextPartNumber } = await import('@/lib/validation');
  const existing = data?.map((r) => r.part_number).filter(Boolean) as string[];
  return nextPartNumber(assemblyNumber, existing);
}
