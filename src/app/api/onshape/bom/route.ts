import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBom } from '@/lib/onshape/client';

const BOM_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
  const supabase = await createClient();

  // Check authentication
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const assemblyId = searchParams.get('assemblyId');

    if (!assemblyId) {
      return NextResponse.json(
        { error: 'assemblyId is required' },
        { status: 400 }
      );
    }

    // Fetch assembly from database
    const { data: assembly, error: assemblyError } = await supabase
      .from('assemblies')
      .select('id, team_id, onshape_doc_id, onshape_workspace_id, onshape_element_id')
      .eq('id', assemblyId)
      .single();

    if (assemblyError || !assembly) {
      return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    }

    // Check if assembly has OnShape links
    if (
      !assembly.onshape_doc_id ||
      !assembly.onshape_workspace_id ||
      !assembly.onshape_element_id
    ) {
      return NextResponse.json(
        { error: 'Assembly not linked to OnShape' },
        { status: 400 }
      );
    }

    // Create cache key
    const cacheKey = `${assembly.onshape_doc_id}/${assembly.onshape_workspace_id}/${assembly.onshape_element_id}`;

    // Check BOM cache
    const { data: cachedData, error: cacheError } = await supabase
      .from('onshape_bom_cache')
      .select('bom_json, fetched_at')
      .eq('team_id', assembly.team_id)
      .eq('cache_key', cacheKey)
      .single();

    // If cache exists and is fresh, return cached data
    if (cachedData && !cacheError) {
      const fetchedAt = new Date(cachedData.fetched_at).getTime();
      const now = Date.now();

      if (now - fetchedAt < BOM_CACHE_DURATION_MS) {
        return NextResponse.json({
          bom: cachedData.bom_json,
          cached: true,
        });
      }
    }

    // Get OnShape credentials from RPC
    const { data: credentials, error: credentialsError } = await supabase.rpc(
      'get_onshape_credentials',
      { p_team_id: assembly.team_id }
    );

    if (credentialsError || !credentials) {
      return NextResponse.json(
        { error: 'OnShape credentials not configured' },
        { status: 400 }
      );
    }

    // Fetch BOM from OnShape
    const bomData = await fetchBom(
      {
        documentId: assembly.onshape_doc_id,
        workspaceType: 'w',
        workspaceId: assembly.onshape_workspace_id,
        elementId: assembly.onshape_element_id,
      },
      {
        accessKey: credentials.access_key,
        secretKey: credentials.secret_key,
      }
    );

    // Upsert cache
    await supabase.from('onshape_bom_cache').upsert({
      team_id: assembly.team_id,
      cache_key: cacheKey,
      bom_json: bomData,
      fetched_at: new Date().toISOString(),
    });

    return NextResponse.json({
      bom: bomData,
      cached: false,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to fetch BOM';
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }
}
