import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AssembliesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id, active_project_code')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) {
    return <div className="text-gray-400 py-8">No team assigned.</div>;
  }

  const activeCode = profile.active_project_code ?? null;

  let assemblyQuery = supabase
    .from('assemblies')
    .select(
      `
      id, assembly_number, name, description, cad_link, parent_assembly_id, created_at,
      parts(id)
    `
    )
    .eq('team_id', profile.team_id)
    .order('assembly_number', { ascending: true });

  if (activeCode) {
    assemblyQuery = assemblyQuery
      .gte('assembly_number', `${activeCode}_`)
      .lt('assembly_number', activeCode + '\x60');
  }

  const { data: assemblies } = await assemblyQuery;

  // Separate top-level and sub-assemblies
  const topLevel = (assemblies ?? []).filter((a) => !a.parent_assembly_id);
  const subMap = (assemblies ?? []).reduce(
    (acc, a) => {
      if (a.parent_assembly_id) {
        acc[a.parent_assembly_id] = [...(acc[a.parent_assembly_id] ?? []), a];
      }
      return acc;
    },
    {} as Record<string, typeof assemblies>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Assemblies</h1>
          <p className="text-gray-400 mt-1">
            {assemblies?.length ?? 0} total
            {activeCode ? ` · Project ${activeCode}` : ''}
          </p>
        </div>
        {activeCode ? (
          <Link
            href="/assemblies/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + New Assembly
          </Link>
        ) : (
          <span
            title="Select a season from the Team page first"
            className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-600 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            + New Assembly
          </span>
        )}
      </div>

      {(!assemblies || assemblies.length === 0) ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {topLevel.map((assembly) => (
            <div key={assembly.id}>
              <AssemblyRow assembly={assembly} isTop />
              {(subMap[assembly.id] ?? []).map((sub) => (
                <AssemblyRow key={sub.id} assembly={sub} isTop={false} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type AssemblyRowProps = {
  assembly: {
    id: string;
    assembly_number: string;
    name: string;
    description: string | null;
    cad_link: string | null;
    parts: { id: string }[] | null;
    created_at: string;
  };
  isTop: boolean;
};

function AssemblyRow({ assembly, isTop }: AssemblyRowProps) {
  const partCount = assembly.parts?.length ?? 0;

  return (
    <Link
      href={`/assemblies/${assembly.id}`}
      className={`flex items-center justify-between p-4 bg-gray-800 rounded-xl border border-gray-700 hover:border-amber-500 hover:shadow-sm transition-all group ${
        !isTop ? 'ml-8 border-l-4 border-l-amber-500' : ''
      }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div>
          <span className="font-mono text-sm font-semibold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">
            {assembly.assembly_number}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-100 group-hover:text-blue-400 truncate">
            {assembly.name}
          </p>
          {assembly.description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{assembly.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <span className="text-sm text-gray-400">{partCount} part{partCount !== 1 ? 's' : ''}</span>
        {assembly.cad_link && (
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">CAD</span>
        )}
        <span className="text-gray-500 group-hover:text-blue-400">›</span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-gray-800 rounded-xl border border-gray-700 border-dashed">
      <span className="text-4xl">🔩</span>
      <h3 className="mt-4 text-lg font-medium text-gray-100">No assemblies yet</h3>
      <p className="mt-2 text-gray-400 text-sm">
        Create your first assembly to start tracking parts.
      </p>
      <Link
        href="/assemblies/new"
        className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        + New Assembly
      </Link>
    </div>
  );
}
