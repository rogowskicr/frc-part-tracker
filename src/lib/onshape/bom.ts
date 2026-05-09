// BOM processing and classification helpers
import type { OnshapeBomItem } from './types';
import type { PartType } from '@/lib/types';

// ── Hierarchical BOM (used by the import endpoint) ────────────────────────────

export interface BomNode {
  name: string;
  /** ASSEMBLY = sub-assembly tab; PART = individual part body */
  nodeType: 'PART' | 'ASSEMBLY';
  quantity: number;
  elementId: string;
  partId: string | null;
  workspaceId: string;
  workspaceType: 'w' | 'v' | 'm';
  documentId: string;
  partType: PartType;
  cadLink: string | null;
  children: BomNode[];
}

/**
 * Convert the flat (but ordered) array from an indented BOM response into a tree.
 *
 * Detection rules:
 *   - Assembly node: itemType === 'ASSEMBLY' OR itemSource.partId is absent
 *   - Depth: item.indent ?? item.itemSource.indentLevel ?? 0
 *
 * COTS parts at the same level are deduplicated by name (multi-body handling).
 * Manufactured parts are kept separate — they have unique part numbers.
 */
export function buildBomHierarchy(items: OnshapeBomItem[]): BomNode[] {
  const roots: BomNode[] = [];
  const stack: Array<{ node: BomNode; indent: number }> = [];

  for (const item of items) {
    if (!item.name || item.excludeFromBom) continue;

    const src = item.itemSource;
    const indent = (item.indent as number | undefined)
      ?? src?.indentLevel
      ?? 0;

    const isAssembly =
      item.itemType?.toUpperCase() === 'ASSEMBLY' || !src?.partId;

    const cadLink = src?.viewHref
      ? src.viewHref.replace('osd.onshape.com', 'cad.onshape.com')
      : null;

    const node: BomNode = {
      name:          item.name,
      nodeType:      isAssembly ? 'ASSEMBLY' : 'PART',
      quantity:      item.quantity ?? 1,
      elementId:     src?.elementId ?? '',
      partId:        src?.partId ?? null,
      workspaceId:   src?.wvmId ?? '',
      workspaceType: (src?.wvmType ?? 'w') as 'w' | 'v' | 'm',
      documentId:    src?.documentId ?? '',
      partType:      classifyItem(item),
      cadLink,
      children:      [],
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].node.children.push(node);
    }

    if (isAssembly) {
      stack.push({ node, indent });
    }
  }

  return dedupeLevel(roots);
}

/**
 * Deduplicate COTS parts within one assembly level by name (multi-body detection).
 * Manufactured parts are left as-is (unique part numbers).
 * Applied recursively to every level.
 */
function dedupeLevel(nodes: BomNode[]): BomNode[] {
  const cotsMap  = new Map<string, BomNode>();
  const others: BomNode[] = [];

  for (const node of nodes) {
    if (node.nodeType === 'PART' && node.partType === 'off_shelf') {
      const key = node.name.trim().toLowerCase();
      const existing = cotsMap.get(key);
      if (existing) {
        existing.quantity += node.quantity;
      } else {
        cotsMap.set(key, { ...node, children: [] });
      }
    } else if (node.nodeType === 'ASSEMBLY') {
      others.push({ ...node, children: dedupeLevel(node.children) });
    } else {
      others.push(node);
    }
  }

  return [...others, ...cotsMap.values()];
}

export interface ProcessedBomPart {
  name: string;
  partId: string | null;
  documentId: string;
  workspaceId: string;
  workspaceType: 'w' | 'v' | 'm';
  elementId: string;
  quantity: number;
  type: PartType;
  /** Direct CAD link (cad.onshape.com URL) for opening this part in OnShape */
  cadLink: string | null;
}

/**
 * Classification rules (based on actual OnShape BOM response structure):
 *  - isStandardContent = true  → always off_shelf (OnShape fastener/hardware library)
 *  - wvmType = 'v'             → off_shelf (part from an external versioned document = purchased library part)
 *  - wvmType = 'w'             → manufactured (part lives in the team's own workspace)
 */
export function classifyItem(item: OnshapeBomItem): PartType {
  const src = item.itemSource;
  if (src?.isStandardContent) return 'off_shelf';
  if (src?.wvmType === 'v') return 'off_shelf';
  return 'manufactured';
}

/** Returns all BOM rows (excluding explicitly excluded items). */
export function processBomItems(items: OnshapeBomItem[]): ProcessedBomPart[] {
  return items
    .filter((i) => !i.excludeFromBom && i.name && i.itemSource)
    .map((i) => {
      // viewHref uses osd.onshape.com (internal); remap to the public cad.onshape.com URL
      const rawHref = i.itemSource.viewHref ?? null;
      const cadLink = rawHref
        ? rawHref.replace('osd.onshape.com', 'cad.onshape.com')
        : null;

      return {
        name:          i.name,
        partId:        i.itemSource.partId ?? null,
        documentId:    i.itemSource.documentId,
        workspaceId:   i.itemSource.wvmId,
        workspaceType: i.itemSource.wvmType,
        elementId:     i.itemSource.elementId,
        quantity:      i.quantity ?? 1,
        type:          classifyItem(i),
        cadLink,
      };
    });
}

/**
 * Deduplicate BOM items, summing quantities.
 *
 * Off-shelf parts: keyed by NAME only.
 *   A multi-body COTS part studio (e.g. WCP-0940 modelled as 6 separate bodies)
 *   produces multiple BOM rows that all share the same product name. They represent
 *   the same physical product and are merged into one line item with the total qty.
 *
 * Manufactured parts: keyed by (elementId, name).
 *   Same-element bodies that share a name are merged (same design, multiple uses).
 *   Bodies from DIFFERENT elements with the same name are kept separate here;
 *   the import route accumulates them into one DB record at write time.
 */
export function dedupeBomItems(items: ProcessedBomPart[]): ProcessedBomPart[] {
  const map = new Map<string, ProcessedBomPart>();
  for (const item of items) {
    const key = bomItemKey(item);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

/**
 * Stable identity key:
 * - off_shelf → product name (detects multi-body COTS; element/partId irrelevant)
 * - manufactured → elementId:name (preserves distinct custom parts; cross-element
 *   dedup is handled during import via name-based DB match + accumulation)
 */
export function bomItemKey(item: ProcessedBomPart): string {
  if (item.type === 'off_shelf') {
    return `cots:${item.name.trim().toLowerCase()}`;
  }
  return `mfg:${item.elementId}:${item.name.trim().toLowerCase()}`;
}
