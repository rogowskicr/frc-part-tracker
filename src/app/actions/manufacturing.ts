'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function getManufacturingProcesses(teamId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('manufacturing_processes')
    .select('id, name')
    .eq('team_id', teamId)
    .order('name');
  return data ?? [];
}

export async function getPartManufacturing(partId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('part_manufacturing')
    .select('id, outsourced, vendor, notes, process:process_id(id, name)')
    .eq('part_id', partId)
    .order('created_at');
  return data ?? [];
}

export async function addPartManufacturing(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') return { error: 'Viewers cannot assign processes' };

  const partId    = formData.get('part_id') as string;
  const processId = (formData.get('process_id') as string) || null;
  const outsourced = formData.get('outsourced') === 'true';
  const vendor    = (formData.get('vendor') as string | null)?.trim() || null;
  const notes     = (formData.get('notes') as string | null)?.trim() || null;

  const { error } = await supabase.from('part_manufacturing').insert({
    part_id:    partId,
    process_id: processId,
    outsourced,
    vendor,
    notes,
  });

  if (error) return { error: error.message };

  revalidatePath(`/parts/${partId}`);
  revalidatePath('/manufacturing');
  return { success: true };
}

export async function updatePartManufacturing(
  id: string,
  partId: string,
  data: {
    processId: string | null;
    outsourced: boolean;
    vendor: string | null;
    notes: string | null;
  }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') return { error: 'Viewers cannot edit processes' };

  const { error } = await supabase
    .from('part_manufacturing')
    .update({
      process_id: data.processId,
      outsourced: data.outsourced,
      vendor: data.vendor,
      notes: data.notes,
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/parts/${partId}`);
  revalidatePath('/manufacturing');
  return { success: true };
}

export async function removePartManufacturing(id: string, partId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') return { error: 'Viewers cannot remove processes' };

  const { error } = await supabase.from('part_manufacturing').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath(`/parts/${partId}`);
  revalidatePath('/manufacturing');
  return { success: true };
}
