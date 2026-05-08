import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import EditAssemblyForm from './EditAssemblyForm';

export default async function EditAssemblyPage({
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

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role === 'viewer') redirect(`/assemblies/${id}`);

  const [assemblyRes, allAssembliesRes] = await Promise.all([
    supabase
      .from('assemblies')
      .select('id, assembly_number, name, description, cad_link, parent_assembly_id')
      .eq('id', id)
      .single(),
    supabase
      .from('assemblies')
      .select('id, assembly_number, name')
      .order('assembly_number'),
  ]);

  if (!assemblyRes.data) notFound();

  const assembly = assemblyRes.data;
  const otherAssemblies = (allAssembliesRes.data ?? []).filter((a) => a.id !== id);

  return (
    <EditAssemblyForm
      assembly={{
        id: assembly.id,
        assembly_number: assembly.assembly_number,
        name: assembly.name,
        description: assembly.description,
        cad_link: assembly.cad_link,
        parent_assembly_id: assembly.parent_assembly_id,
      }}
      assemblies={otherAssemblies}
    />
  );
}
