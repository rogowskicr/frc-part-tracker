import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Navbar from '@/components/Navbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('name, team_id')
    .eq('id', user.id)
    .single();

  const { data: team } = profile?.team_id
    ? await supabase.from('teams').select('name').eq('id', profile.team_id).single()
    : { data: null };

  const teamName = team?.name ?? '';
  const teamId = profile?.team_id ?? null;
  const userName = profile?.name ?? '';

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <Navbar userName={userName} teamName={teamName} teamId={teamId} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
