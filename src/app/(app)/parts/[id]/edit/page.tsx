import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import EditPartForm from './EditPartForm';

export default async function EditPartPage({
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
    .select('team_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) redirect('/login');
  if (profile.role === 'viewer') redirect(`/parts/${id}`);

  const [partRes, membersRes, assembliesRes] = await Promise.all([
    supabase
      .from('parts')
      .select(
        `id, part_number, name, description, type, cad_link, assigned_to, assembly_id,
         bom_items(onshape_quantity, cots_quantity_spare, cots_vendor, cots_supplier_part_number, cots_purchase_link)`
      )
      .eq('id', id)
      .single(),
    supabase
      .from('user_profiles')
      .select('id, name')
      .eq('team_id', profile.team_id)
      .order('name'),
    supabase
      .from('assemblies')
      .select('id, assembly_number, name')
      .eq('team_id', profile.team_id)
      .order('assembly_number'),
  ]);

  if (!partRes.data) notFound();

  const part = partRes.data;
  const bom = (part.bom_items as Array<{
    onshape_quantity: number;
    cots_quantity_spare: number;
    cots_vendor: string | null;
    cots_supplier_part_number: string | null;
    cots_purchase_link: string | null;
  }>)?.[0] ?? null;

  return (
    <EditPartForm
      part={{
        id: part.id,
        part_number: part.part_number,
        name: part.name,
        description: part.description,
        type: part.type as 'manufactured' | 'off_shelf',
        cad_link: part.cad_link,
        assigned_to: part.assigned_to,
        assembly_id: part.assembly_id,
      }}
      bom={bom}
      teamMembers={membersRes.data ?? []}
      assemblies={assembliesRes.data ?? []}
    />
  );
}
