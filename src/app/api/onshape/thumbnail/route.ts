import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchShadedView } from '@/lib/onshape/client';

export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('team_id')
    .eq('id', user.id)
    .single();

  if (!profile?.team_id) return NextResponse.json({ error: 'No active team' }, { status: 400 });

  const partId = new URL(request.url).searchParams.get('partId');
  if (!partId) return NextResponse.json({ error: 'partId required' }, { status: 400 });

  const { data: part } = await supabase
    .from('parts')
    .select('id, team_id, onshape_part_id, onshape_element_id, onshape_workspace_id, assembly:assembly_id(onshape_doc_id)')
    .eq('id', partId)
    .eq('team_id', profile.team_id)
    .single();

  if (!part) return NextResponse.json({ error: 'Part not found' }, { status: 404 });
  if (!part.onshape_part_id || !part.onshape_element_id || !part.onshape_workspace_id) {
    return NextResponse.json({ error: 'Part not linked to OnShape' }, { status: 400 });
  }

  const assembly = part.assembly as unknown as { onshape_doc_id: string | null } | null;
  if (!assembly?.onshape_doc_id) {
    return NextResponse.json({ error: 'Parent assembly not linked to OnShape' }, { status: 400 });
  }

  const { data: creds } = await supabase.rpc('get_onshape_credentials', {
    p_team_id: profile.team_id,
  });
  if (!creds) return NextResponse.json({ error: 'OnShape credentials not configured' }, { status: 400 });

  try {
    const views = await fetchShadedView(
      assembly.onshape_doc_id,
      'w',
      part.onshape_workspace_id,
      part.onshape_element_id,
      part.onshape_part_id,
      { accessKey: creds.access_key, secretKey: creds.secret_key },
    );

    if (!views?.[0]?.viewData) {
      return NextResponse.json({ error: 'No thumbnail available' }, { status: 404 });
    }

    const imgBuffer = Buffer.from(views[0].viewData, 'base64');
    return new Response(imgBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
