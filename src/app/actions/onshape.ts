'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { parseOnshapeUrl } from '@/lib/onshape/client';

/** Admin: save OnShape API credentials for their team. */
export async function saveOnshapeCredentials(teamId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: membership } = await supabase
    .from('team_memberships')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  if (membership?.role !== 'admin') return { error: 'Only admins can manage OnShape credentials' };

  const accessKey = (formData.get('access_key') as string)?.trim();
  const secretKey = (formData.get('secret_key') as string)?.trim();

  if (!accessKey || !secretKey) return { error: 'Both access key and secret key are required' };

  const { error } = await supabase.rpc('save_onshape_credentials', {
    p_team_id:    teamId,
    p_access_key: accessKey,
    p_secret_key: secretKey,
  });

  if (error) return { error: error.message };

  revalidatePath(`/team/${teamId}`);
  return { success: true };
}

/** Link an assembly to an OnShape document URL (parses docId/workspaceId/elementId). */
export async function linkAssemblyToOnshape(assemblyId: string, onshapeUrl: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'viewer') return { error: 'Viewers cannot link assemblies' };

  const parsed = parseOnshapeUrl(onshapeUrl.trim());
  if (!parsed) {
    return {
      error:
        'Invalid OnShape URL. Expected format: https://cad.onshape.com/documents/{docId}/w/{workspaceId}/e/{elementId}',
    };
  }

  const { error } = await supabase
    .from('assemblies')
    .update({
      onshape_doc_id:       parsed.documentId,
      onshape_workspace_id: parsed.workspaceId,
      onshape_element_id:   parsed.elementId,
      cad_link:             onshapeUrl.trim(),
    })
    .eq('id', assemblyId);

  if (error) return { error: error.message };

  revalidatePath(`/assemblies/${assemblyId}`);
  return { success: true };
}

/** Unlink an assembly from OnShape (clears all OnShape fields). */
export async function unlinkAssemblyFromOnshape(assemblyId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'viewer') return { error: 'Viewers cannot modify assemblies' };

  const { error } = await supabase
    .from('assemblies')
    .update({
      onshape_doc_id:       null,
      onshape_workspace_id: null,
      onshape_element_id:   null,
      onshape_last_sync:    null,
    })
    .eq('id', assemblyId);

  if (error) return { error: error.message };

  revalidatePath(`/assemblies/${assemblyId}`);
  return { success: true };
}
