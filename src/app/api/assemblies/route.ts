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
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json([]);

  const { data } = await supabase
    .from('assemblies')
    .select('id, assembly_number, name')
    .eq('team_id', profile.team_id)
    .order('assembly_number', { ascending: true });

  return NextResponse.json(data ?? []);
}
