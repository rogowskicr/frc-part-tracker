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

  // Use a security definer RPC to create team + update profile + insert processes.
  // This bypasses RLS since the session cookie may not be flushed yet in the same action.
  const { error: rpcError } = await supabase.rpc('complete_signup', {
    p_team_name: teamName,
    p_team_year: teamYear,
    p_user_name: name,
  });

  if (rpcError) {
    return { error: rpcError.message };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
