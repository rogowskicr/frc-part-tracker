'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function updateOrderStatus(
  vendor: string,
  projectCode: string,
  newStatus: 'pending' | 'ordered' | 'received',
  vendorPartIds?: string[],
) {
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

  if (!profile?.team_id) return { error: 'No team' };
  if (profile.role === 'viewer') return { error: 'Viewers cannot update orders' };

  const { error } = await supabase.from('cots_orders').upsert(
    {
      team_id: profile.team_id,
      project_code: projectCode,
      vendor,
      status: newStatus,
      ordered_at: newStatus === 'ordered' ? new Date().toISOString() : null,
      received_at: newStatus === 'received' ? new Date().toISOString() : null,
    },
    { onConflict: 'team_id,project_code,vendor' }
  );

  if (error) return { error: error.message };

  // Cascade per-line flags when vendor-level status changes
  if (vendorPartIds && vendorPartIds.length > 0) {
    if (newStatus === 'ordered') {
      await supabase.from('bom_items').update({ cots_ordered: true }).in('part_id', vendorPartIds);
    } else if (newStatus === 'received') {
      await supabase.from('bom_items').update({ cots_ordered: true, cots_received: true }).in('part_id', vendorPartIds);
    } else if (newStatus === 'pending') {
      await supabase.from('bom_items').update({ cots_ordered: false, cots_received: false }).in('part_id', vendorPartIds);
    }
  }

  revalidatePath('/orders');
  return { success: true };
}

export async function markLineReceived(partIds: string[], received: boolean) {
  if (partIds.length === 0) return { success: true };

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

  if (profile?.role === 'viewer') return { error: 'Viewers cannot update orders' };

  const { error } = await supabase
    .from('bom_items')
    .update({ cots_received: received })
    .in('part_id', partIds);

  if (error) return { error: error.message };
  revalidatePath('/orders');
  return { success: true };
}

export async function markLineOrdered(partIds: string[], ordered: boolean) {
  if (partIds.length === 0) return { success: true };

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

  if (profile?.role === 'viewer') return { error: 'Viewers cannot update orders' };

  const { error } = await supabase
    .from('bom_items')
    .update({ cots_ordered: ordered })
    .in('part_id', partIds);

  if (error) return { error: error.message };
  revalidatePath('/orders');
  return { success: true };
}
