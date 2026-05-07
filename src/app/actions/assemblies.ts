'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { validateAssemblyNumber } from '@/lib/validation';

export async function createAssembly(formData: FormData) {
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

  const assembly_number = (formData.get('assembly_number') as string).trim().toUpperCase();
  const name = (formData.get('name') as string).trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const cad_link = (formData.get('cad_link') as string | null)?.trim() || null;
  const parent_assembly_id = (formData.get('parent_assembly_id') as string | null) || null;

  const validationError = validateAssemblyNumber(assembly_number);
  if (validationError) return { error: validationError };

  const { data, error } = await supabase
    .from('assemblies')
    .insert({
      assembly_number,
      name,
      description,
      cad_link,
      parent_assembly_id: parent_assembly_id || null,
      team_id: profile.team_id,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  revalidatePath('/assemblies');
  redirect(`/assemblies/${data.id}`);
}

export async function updateAssembly(id: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const name = (formData.get('name') as string).trim();
  const description = (formData.get('description') as string | null)?.trim() || null;
  const cad_link = (formData.get('cad_link') as string | null)?.trim() || null;

  const { error } = await supabase
    .from('assemblies')
    .update({ name, description, cad_link })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/assemblies');
  revalidatePath(`/assemblies/${id}`);
  return { success: true };
}

export async function deleteAssembly(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from('assemblies').delete().eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/assemblies');
  redirect('/assemblies');
}

export async function getNextAssemblyNumber(year: number): Promise<string> {
  const supabase = await createClient();
  const yy = String(year).slice(-2);

  const { data } = await supabase
    .from('assemblies')
    .select('assembly_number')
    .like('assembly_number', `${yy}_A_%`);

  const { nextTopLevelAssemblyNumber } = await import('@/lib/validation');
  const existing = data?.map((r) => r.assembly_number) ?? [];
  return nextTopLevelAssemblyNumber(year, existing);
}
