import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchBom } from '@/lib/onshape/client';
import { buildBomHierarchy, type BomNode } from '@/lib/onshape/bom';
import {
  checkNamingConformance,
  nextPartNumber,
  nextSubAssemblyNumber,
  isValidPartNumber,
  isValidAssemblyNumber,
} from '@/lib/validation';
import type { SupabaseClient } from '@supabase/supabase-js';

const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Types for shared import state ─────────────────────────────────────────────

interface ImportState {
  teamId: string;
  userId: string;
  supabase: SupabaseClient;
  /** All team assemblies — mutated in-place as sub-assemblies are created */
  assemblies: Array<{ id: string; assembly_number: string; name: string; onshape_element_id: string | null; parent_assembly_id: string | null }>;
  /** All team part numbers — mutated to reserve newly assigned numbers */
  existingPartNums: string[];
  created: string[];
  updated: string[];
  skipped: string[];
}

// ── Main route handler ────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('team_id, role, active_project_code')
      .eq('id', user.id)
      .single();

    if (!profile?.team_id) return NextResponse.json({ error: 'No active team' }, { status: 400 });
    if (profile.role === 'viewer') return NextResponse.json({ error: 'Viewers cannot import' }, { status: 403 });

    let assemblyId: string;
    try {
      const body = await request.json();
      assemblyId = body.assemblyId;
      if (!assemblyId) throw new Error();
    } catch {
      return NextResponse.json({ error: 'assemblyId is required' }, { status: 400 });
    }

    const { data: assembly } = await supabase
      .from('assemblies')
      .select('id, assembly_number, team_id, onshape_doc_id, onshape_workspace_id, onshape_element_id')
      .eq('id', assemblyId)
      .eq('team_id', profile.team_id)
      .single();

    if (!assembly) return NextResponse.json({ error: 'Assembly not found' }, { status: 404 });
    if (!assembly.onshape_doc_id || !assembly.onshape_workspace_id || !assembly.onshape_element_id) {
      return NextResponse.json({ error: 'Assembly not linked to OnShape' }, { status: 400 });
    }

    // Use a separate cache key for the indented BOM
    const cacheKey = `indented:${assembly.onshape_doc_id}/${assembly.onshape_workspace_id}/${assembly.onshape_element_id}`;

    let bomData: Awaited<ReturnType<typeof fetchBom>> | null = null;
    const { data: cached } = await supabase
      .from('onshape_bom_cache')
      .select('bom_json, fetched_at')
      .eq('team_id', profile.team_id)
      .eq('cache_key', cacheKey)
      .single();

    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
      bomData = cached.bom_json as typeof bomData;
    } else {
      const { data: creds } = await supabase.rpc('get_onshape_credentials', { p_team_id: profile.team_id });
      if (!creds) return NextResponse.json({ error: 'OnShape credentials not configured' }, { status: 400 });

      bomData = await fetchBom(
        { documentId: assembly.onshape_doc_id, workspaceType: 'w', workspaceId: assembly.onshape_workspace_id, elementId: assembly.onshape_element_id },
        { accessKey: creds.access_key, secretKey: creds.secret_key },
        { indented: true },
      );
      await supabase.from('onshape_bom_cache').upsert({
        team_id: profile.team_id, cache_key: cacheKey,
        bom_json: bomData, fetched_at: new Date().toISOString(),
      });
    }

    const rawItems = bomData?.bomTable?.items ?? [];
    if (rawItems.length === 0) {
      return NextResponse.json({ success: true, created: 0, updated: 0, skipped: 0, details: { created: [], updated: [], skipped: ['BOM returned no items'] } });
    }

    const hierarchy = buildBomHierarchy(rawItems);

    // Fetch all team assemblies and part numbers upfront for dedup/numbering
    const [{ data: allAsms }, { data: allParts }] = await Promise.all([
      supabase.from('assemblies').select('id, assembly_number, name, onshape_element_id, parent_assembly_id').eq('team_id', profile.team_id),
      supabase.from('parts').select('part_number').eq('team_id', profile.team_id),
    ]);

    const state: ImportState = {
      teamId:           profile.team_id,
      userId:           user.id,
      supabase,
      assemblies:       allAsms ?? [],
      existingPartNums: (allParts ?? []).map(p => p.part_number).filter(Boolean) as string[],
      created: [],
      updated: [],
      skipped: [],
    };

    await importNodes(hierarchy, assemblyId, assembly.assembly_number, state);

    await supabase.from('assemblies')
      .update({ onshape_last_sync: new Date().toISOString() })
      .eq('id', assemblyId);

    return NextResponse.json({
      success: true,
      created: state.created.length,
      updated: state.updated.length,
      skipped: state.skipped.length,
      details: { created: state.created, updated: state.updated, skipped: state.skipped },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

// ── Recursive node processor ───────────────────────────────────────────────────

async function importNodes(
  nodes: BomNode[],
  parentAssemblyId: string,
  parentAssemblyNumber: string,
  state: ImportState,
): Promise<void> {
  const { supabase, teamId, userId, assemblies, existingPartNums, created, updated, skipped } = state;

  // Existing parts for this specific assembly (checked per-assembly to avoid cross-assignment)
  const { data: existingParts } = await supabase
    .from('parts')
    .select('id, name, part_number, onshape_part_id, onshape_element_id')
    .eq('assembly_id', parentAssemblyId);

  // Track manufactured parts created at this level for cross-element accumulation
  const createdThisLevel = new Map<string, { id: string; qty: number }>();

  for (const node of nodes) {
    if (node.nodeType === 'ASSEMBLY') {
      // ── Sub-assembly ───────────────────────────────────────────────────────
      const asmNumber = isValidAssemblyNumber(node.name.trim().toUpperCase())
        ? node.name.trim().toUpperCase()
        : nextSubAssemblyNumber(
            parentAssemblyNumber,
            assemblies.map(a => a.assembly_number),
          );

      // Check if already exists by OnShape element ID or by name/number
      let subAsm = assemblies.find(
        a => (node.elementId && a.onshape_element_id === node.elementId)
          || a.assembly_number === asmNumber
          || a.name.trim().toLowerCase() === node.name.trim().toLowerCase(),
      );

      if (subAsm) {
        // Backfill OnShape link if missing
        if (!subAsm.onshape_element_id && node.elementId) {
          await supabase.from('assemblies').update({
            onshape_doc_id:       node.documentId,
            onshape_element_id:   node.elementId,
            onshape_workspace_id: node.workspaceId,
            cad_link:             node.cadLink,
            parent_assembly_id:   parentAssemblyId,
          }).eq('id', subAsm.id);
        }
        updated.push(`${subAsm.assembly_number} (assembly)`);
      } else {
        // Reserve the number
        if (!assemblies.some(a => a.assembly_number === asmNumber)) {
          assemblies.push({ id: '', assembly_number: asmNumber, name: node.name, onshape_element_id: node.elementId, parent_assembly_id: parentAssemblyId });
        }

        const { data: newAsm, error: asmErr } = await supabase
          .from('assemblies')
          .insert({
            assembly_number:      asmNumber,
            name:                 node.name,
            team_id:              teamId,
            parent_assembly_id:   parentAssemblyId,
            created_by:           userId,
            onshape_doc_id:       node.documentId,
            onshape_element_id:   node.elementId,
            onshape_workspace_id: node.workspaceId,
            cad_link:             node.cadLink,
          })
          .select('id, assembly_number, name, onshape_element_id, parent_assembly_id')
          .single();

        if (asmErr || !newAsm) {
          skipped.push(`${node.name} (assembly: ${asmErr?.message ?? 'insert failed'})`);
          continue;
        }

        // Replace the placeholder with the real record
        const idx = assemblies.findIndex(a => a.assembly_number === asmNumber && a.id === '');
        if (idx >= 0) assemblies[idx] = newAsm;
        else assemblies.push(newAsm);

        subAsm = newAsm;
        created.push(`${asmNumber} (assembly)`);
      }

      // Recursively import this sub-assembly's children
      if (node.children.length > 0) {
        await importNodes(node.children, subAsm.id, subAsm.assembly_number, state);
      }
    } else {
      // ── Part ───────────────────────────────────────────────────────────────
      const nameLower = node.name.trim().toLowerCase();

      // Match existing: by name (handles COTS multi-body + same part from diff elements)
      let existing = (existingParts ?? []).find(
        p => p.name.trim().toLowerCase() === nameLower,
      );
      // Fallback: conformant part number match (manually-created parts)
      if (!existing && isValidPartNumber(node.name)) {
        existing = (existingParts ?? []).find(p => p.part_number === node.name.toUpperCase());
      }

      if (existing) {
        if (!existing.onshape_element_id) {
          await supabase.from('parts').update({
            onshape_part_id:      node.partId,
            onshape_element_id:   node.elementId,
            onshape_workspace_id: node.workspaceId,
            cad_link:             node.cadLink,
          }).eq('id', existing.id);
        }
        await supabase.from('bom_items')
          .update({ onshape_quantity: node.quantity })
          .eq('part_id', existing.id);
        updated.push(node.name);
        continue;
      }

      // Manufactured: accumulate quantities across element contexts at this level
      if (node.partType === 'manufactured') {
        const inLevel = createdThisLevel.get(nameLower);
        if (inLevel) {
          const newQty = inLevel.qty + node.quantity;
          await supabase.from('bom_items')
            .update({ onshape_quantity: newQty })
            .eq('part_id', inLevel.id);
          createdThisLevel.set(nameLower, { id: inLevel.id, qty: newQty });
          updated.push(node.name);
          continue;
        }
      }

      // Assign part number
      let partNumber: string | null = null;
      if (node.partType === 'manufactured') {
        partNumber = isValidPartNumber(node.name)
          ? node.name.toUpperCase()
          : nextPartNumber(parentAssemblyNumber, existingPartNums);
        if (partNumber && !existingPartNums.includes(partNumber)) {
          existingPartNums.push(partNumber);
        }
      }

      const { data: newPart, error: partErr } = await supabase
        .from('parts')
        .insert({
          name:                 node.name,
          part_number:          partNumber,
          assembly_id:          parentAssemblyId,
          team_id:              teamId,
          type:                 node.partType,
          status:               'design',
          naming_flagged:       !checkNamingConformance(node.name, 'part').conforms,
          created_by:           userId,
          cad_link:             node.cadLink,
          onshape_part_id:      node.partId,
          onshape_element_id:   node.elementId,
          onshape_workspace_id: node.workspaceId,
        })
        .select('id')
        .single();

      if (partErr || !newPart) {
        skipped.push(`${node.name} (${partErr?.message ?? 'insert failed'})`);
        continue;
      }

      if (node.partType === 'manufactured') {
        createdThisLevel.set(nameLower, { id: newPart.id, qty: node.quantity });
      }

      await supabase.from('bom_items').insert({
        assembly_id:         parentAssemblyId,
        part_id:             newPart.id,
        onshape_quantity:    node.quantity,
        cots_quantity:       node.partType === 'off_shelf' ? node.quantity : null,
        cots_quantity_spare: 0,
      });
      await supabase.from('part_status_history').insert({
        part_id:    newPart.id,
        status:     'design',
        changed_by: userId,
      });

      created.push(node.name);
    }
  }
}
