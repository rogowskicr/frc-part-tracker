import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ code: null }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('active_project_code')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ code: profile?.active_project_code ?? null });
}
