import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json([], { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, active_project_code')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json([]);

  const activeCode = profile.active_project_code ?? null;

  let query = supabase
    .from('assemblies')
    .select('id, assembly_number, name')
    .eq('team_id', profile.team_id)
    .order('assembly_number', { ascending: true });

  if (activeCode) {
    // Use regex so "26" doesn't accidentally include "26A_..." entries.
    query = query
      .gte('assembly_number', `${activeCode}_`)
      .lt('assembly_number', activeCode + '\x60');
  }

  const { data } = await query;
  return NextResponse.json(data ?? []);
}
