'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function saveCustomVendor(name: string, type: 'cots' | 'outsourced' | 'both') {
  const trimmed = name.trim();
  if (!trimmed) return { error: 'Vendor name is required' };

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return { error: 'No team' };
  if (profile.role === 'viewer') return { error: 'Viewers cannot add vendors' };

  const { error } = await supabase.from('team_vendors').upsert(
    { team_id: profile.team_id, name: trimmed, type },
    { onConflict: 'team_id,name,type' }
  );

  if (error) return { error: error.message };
  revalidatePath('/parts');
  return { success: true };
}

export async function getTeamVendors(type: 'cots' | 'outsourced') {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return [];

  const { data } = await supabase
    .from('team_vendors')
    .select('name')
    .eq('team_id', profile.team_id)
    .or(`type.eq.${type},type.eq.both`)
    .order('name');

  return (data ?? []).map((v) => v.name);
}
