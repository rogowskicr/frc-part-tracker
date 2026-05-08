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
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return { error: 'No team found' };

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

  const name = (formData.get('name') as string).trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const cad_link = (formData.get('cad_link') as string | null)?.trim() || null;
  const assigned_to = (formData.get('assigned_to') as string | null) || null;
  const type = formData.get('type') as 'manufactured' | 'off_shelf';

  let naming_flagged: boolean | undefined;
  if (type === 'manufactured') {
    const conformance = checkNamingConformance(name, 'part');
    naming_flagged = !conformance.conforms;
  }

  const updateFields: Record<string, unknown> = { name, description, cad_link, assigned_to: assigned_to || null };
  if (naming_flagged !== undefined) updateFields.naming_flagged = naming_flagged;

  const { error } = await supabase.from('parts').update(updateFields).eq('id', id);
  if (error) return { error: error.message };

  const onshape_quantity = parseInt(formData.get('quantity') as string, 10) || 1;
  const cots_quantity_spare = parseInt(formData.get('spare_quantity') as string, 10) || 0;
  const cots_vendor = (formData.get('cots_vendor') as string | null)?.trim() || null;
  const cots_supplier_part_number = (formData.get('cots_supplier_part_number') as string | null)?.trim() || null;
  const cots_purchase_link = (formData.get('cots_purchase_link') as string | null)?.trim() || null;

  await supabase.from('bom_items').update({
    onshape_quantity,
    cots_quantity_spare,
    cots_vendor,
    cots_supplier_part_number,
    cots_purchase_link,
  }).eq('part_id', id);

  revalidatePath(`/parts/${id}`);
  revalidatePath('/parts');
  redirect(`/parts/${id}`);
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
