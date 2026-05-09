// Temporary debug route — returns the raw OnShape BOM JSON for an assembly.
// Remove once BOM import is confirmed working.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBom } from '@/lib/onshape/client';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const assemblyId = new URL(request.url).searchParams.get('assemblyId');
    if (!assemblyId) return NextResponse.json({ error: 'assemblyId required' }, { status: 400 });

    const { data: profile } = await supabase.from('user_profiles').select('team_id').eq('id', user.id).single();
    if (!profile?.team_id) return NextResponse.json({ error: 'No team' }, { status: 400 });

    const { data: assembly } = await supabase
      .from('assemblies')
      .select('onshape_doc_id, onshape_workspace_id, onshape_element_id')
      .eq('id', assemblyId)
      .single();

    if (!assembly?.onshape_doc_id) return NextResponse.json({ error: 'Not linked' }, { status: 400 });

    const { data: creds } = await supabase.rpc('get_onshape_credentials', { p_team_id: profile.team_id });
    if (!creds) return NextResponse.json({ error: 'No credentials' }, { status: 400 });

    const bom = await fetchBom(
      {
        documentId:    assembly.onshape_doc_id,
        workspaceType: 'w',
        workspaceId:   assembly.onshape_workspace_id,
        elementId:     assembly.onshape_element_id,
      },
      { accessKey: creds.access_key, secretKey: creds.secret_key },
    );

    // Return both the raw BOM and a summary of what processBomItems would see
    const items = bom.bomTable?.items ?? [];
    const summary = items.map((item: Record<string, unknown>) => ({
      itemType:   item.itemType,
      itemSource: item.itemSource,
      quantity:   item.quantity,
      name:       item.name,
      partId:     item.partId,
      documentId: item.documentId,
      elementId:  item.elementId,
      indent:     item.indent,
      headerKeys: item.headerIdToValue ? Object.keys(item.headerIdToValue as object) : null,
      headerValues: item.headerIdToValue,
    }));

    return NextResponse.json({ itemCount: items.length, summary, rawFirst3: items.slice(0, 3) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
