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
    .select('name, team_id, teams(name)')
    .eq('id', user.id)
    .single();

  const teamName = (profile?.teams as { name?: string } | null)?.name ?? 'No team';
  const userName = profile?.name ?? user.email ?? '';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={userName} teamName={teamName} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
