'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function joinAdditionalTeam(formData: FormData) {
  const supabase = await createClient();
  const joinCode = (formData.get('join_code') as string)?.trim();

  if (!joinCode) return { error: 'Join code is required' };

  const { error } = await supabase.rpc('add_team_membership', { p_join_code: joinCode });
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function createAdditionalTeam(formData: FormData) {
  const supabase = await createClient();
  const teamName = (formData.get('team_name') as string)?.trim();

  if (!teamName) return { error: 'Team name is required' };

  const { error } = await supabase.rpc('create_additional_team', {
    p_team_name: teamName,
  });
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  return { success: true };
}

export async function switchTeam(teamId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('switch_active_team', { p_team_id: teamId });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function updateMemberRole(teamId: string, userId: string, role: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_member_role', {
    p_team_id: teamId,
    p_user_id: userId,
    p_new_role: role,
  });
  if (error) return { error: error.message };
  revalidatePath(`/team/${teamId}`);
  return { success: true };
}

export async function removeTeamMember(teamId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_team_member', {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/team/${teamId}`);
  return { success: true };
}

export async function leaveTeam(teamId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('leave_team', { p_team_id: teamId });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function addTeamProject(
  teamId: string,
  year: number,
  suffix: string,
  callerId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_team_project', {
    p_team_id:   teamId,
    p_year:      year,
    p_suffix:    suffix,
    p_caller_id: callerId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/team/${teamId}`);
  return { success: true };
}

export async function removeTeamProject(
  teamId: string,
  year: number,
  suffix: string,
  callerId: string,
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_team_project', {
    p_team_id:   teamId,
    p_year:      year,
    p_suffix:    suffix,
    p_caller_id: callerId,
  });
  if (error) return { error: error.message };
  revalidatePath(`/team/${teamId}`);
  return { success: true };
}

export async function setActiveProject(code: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_active_project', { p_code: code });
  if (error) return { error: error.message };
  revalidatePath('/', 'layout');
  return { success: true };
}
