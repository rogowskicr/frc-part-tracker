'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const name = formData.get('name') as string;
  const teamName = formData.get('team_name') as string;
  const teamYear = parseInt(formData.get('team_year') as string, 10);

  // Create the user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: 'Signup failed. Please try again.' };
  }

  // Create the team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ name: teamName, year: teamYear })
    .select()
    .single();

  if (teamError) {
    return { error: teamError.message };
  }

  // Update user profile with team and admin role
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ team_id: team.id, role: 'admin', name })
    .eq('id', authData.user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  // Insert default manufacturing processes for the new team
  const defaultProcesses = [
    '3D Printing',
    'Laser Cut',
    'CNC Mill',
    'CNC Lathe',
    'Hand Fabrication',
    'Welding',
    'Sheet Metal',
  ];
  await supabase.from('manufacturing_processes').insert(
    defaultProcesses.map((name) => ({ team_id: team.id, name }))
  );

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
