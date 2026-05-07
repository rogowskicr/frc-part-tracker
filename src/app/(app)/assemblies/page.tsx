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
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) {
    return <div className="text-gray-500 py-8">No team assigned.</div>;
  }

  const { data: assemblies } = await supabase
    .from('assemblies')
    .select(
      `
      id, assembly_number, name, description, cad_link, parent_assembly_id, created_at,
      parts(id)
    `
    )
    .eq('team_id', profile.team_id)
    .order('assembly_number', { ascending: true });

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
          <h1 className="text-2xl font-bold text-gray-900">Assemblies</h1>
          <p className="text-gray-500 mt-1">{assemblies?.length ?? 0} total</p>
        </div>
        <Link
          href="/assemblies/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + New Assembly
        </Link>
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
      className={`flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-sm transition-all group ${
        !isTop ? 'ml-8 border-l-4 border-l-blue-200' : ''
      }`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div>
          <span className="font-mono text-sm font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
            {assembly.assembly_number}
          </span>
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 group-hover:text-blue-600 truncate">
            {assembly.name}
          </p>
          {assembly.description && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{assembly.description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <span className="text-sm text-gray-500">{partCount} part{partCount !== 1 ? 's' : ''}</span>
        {assembly.cad_link && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">CAD</span>
        )}
        <span className="text-gray-400 group-hover:text-blue-500">›</span>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 bg-white rounded-xl border border-gray-200 border-dashed">
      <span className="text-4xl">🔩</span>
      <h3 className="mt-4 text-lg font-medium text-gray-900">No assemblies yet</h3>
      <p className="mt-2 text-gray-500 text-sm">
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
