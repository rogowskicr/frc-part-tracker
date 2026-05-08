import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import CopyButton from '@/components/CopyButton';
import MemberList from './MemberList';
import ProjectPanel, { type TeamProject } from './SeasonPanel';

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: myMembership } = await supabase
    .from('team_memberships')
    .select('role')
    .eq('team_id', id)
    .eq('user_id', user.id)
    .single();

  if (!myMembership) notFound();

  const isAdmin = myMembership.role === 'admin';

  const [teamRes, membersRes, projectsRes, profileRes] = await Promise.all([
    supabase.from('teams').select('id, name, join_code').eq('id', id).single(),
    supabase.rpc('get_team_members', { p_team_id: id, p_caller_id: user.id }),
    supabase
      .from('team_projects')
      .select('year, suffix')
      .eq('team_id', id)
      .order('year',   { ascending: false })
      .order('suffix', { ascending: true }),
    supabase
      .from('user_profiles')
      .select('active_project_code')
      .eq('id', user.id)
      .single(),
  ]);

  const team = teamRes.data;
  if (!team) notFound();

  const members = (membersRes.data ?? []) as {
    user_id: string;
    user_name: string;
    role: string;
    joined_at: string;
  }[];

  const projects: TeamProject[] = (projectsRes.data ?? []) as TeamProject[];
  const activeCode: string | null = profileRes.data?.active_project_code ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/dashboard" className="hover:text-gray-300">Dashboard</Link>
        <span>›</span>
        <span className="text-gray-200">{team.name}</span>
      </div>

      {/* Header */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">{team.name}</h1>
            {activeCode ? (
              <p className="text-sm text-amber-400 mt-1">Project {activeCode} active</p>
            ) : projects.length > 0 ? (
              <p className="text-sm text-gray-400 mt-1">
                {projects.length} project{projects.length !== 1 ? 's' : ''} · viewing all
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Join Code</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-amber-400 tracking-widest">
                {team.join_code}
              </span>
              <CopyButton text={team.join_code} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-gray-400 pt-1 border-t border-gray-700">
          <span>{members.length} member{members.length !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span>
            {members.filter((m) => m.role === 'admin').length} admin
            {members.filter((m) => m.role === 'admin').length !== 1 ? 's' : ''}
          </span>
          {isAdmin && (
            <>
              <span>·</span>
              <span className="text-amber-400">You are an admin</span>
            </>
          )}
        </div>
      </div>

      {/* Projects */}
      <ProjectPanel
        teamId={id}
        projects={projects}
        activeCode={activeCode}
        isAdmin={isAdmin}
        currentUserId={user.id}
      />

      {/* Members */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-gray-100">Members</h2>
          {isAdmin && (
            <p className="text-xs text-gray-400 mt-0.5">
              Use the role dropdown to change a member's role, or remove them from the team.
            </p>
          )}
        </div>
        <div className="px-5">
          <MemberList
            teamId={id}
            members={members}
            currentUserId={user.id}
            isAdmin={isAdmin}
          />
        </div>
      </div>
    </div>
  );
}
