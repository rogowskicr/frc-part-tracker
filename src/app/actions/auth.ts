'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function generateEmail(username: string): string {
  return `${username.toLowerCase()}@frc-part-tracker.local`;
}

export async function login(formData: FormData) {
  const supabase = await createClient();

  const username = (formData.get('username') as string).toLowerCase();
  const password = formData.get('password') as string;

  if (!username || !password) {
    return { error: 'Username and password are required' };
  }

  const email = generateEmail(username);

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'Invalid username or password' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const mode = (formData.get('mode') as string) || 'create';
  const username = (formData.get('username') as string).toLowerCase();
  const password = formData.get('password') as string;
  const name = (formData.get('name') as string)?.trim();

  if (!username || !password || !name) {
    return { error: 'All fields are required' };
  }

  if (username.length < 3 || username.length > 20) {
    return { error: 'Username must be 3-20 characters' };
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    return { error: 'Username can only contain letters, numbers, and underscores' };
  }

  const email = generateEmail(username);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, name } },
  });

  if (authError) {
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: 'Signup failed. Please try again.' };
  }

  if (mode === 'join') {
    const joinCode = (formData.get('join_code') as string)?.trim();
    if (!joinCode) return { error: 'Join code is required' };

    const { error: rpcError } = await supabase.rpc('join_team', {
      p_join_code: joinCode,
      p_user_name: name,
    });

    if (rpcError) {
      return { error: rpcError.message };
    }
  } else {
    const teamName = (formData.get('team_name') as string)?.trim();
    if (!teamName) return { error: 'Team name is required' };

    const { error: rpcError } = await supabase.rpc('complete_signup', {
      p_team_name: teamName,
      p_user_name: name,
    });

    if (rpcError) {
      return { error: rpcError.message };
    }
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
