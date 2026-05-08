// BOM processing and classification helpers
import type { OnshapeBomItem } from './types';
import type { PartType } from '@/lib/types';

export interface ProcessedBomPart {
  name: string;
  partId: string | null;
  documentId: string;
  workspaceId: string;
  elementId: string;
  quantity: number;
  type: PartType;
  itemType: 'PART' | 'ASSEMBLY';
}

export function classifyItem(item: OnshapeBomItem): PartType {
  const src = item.itemSource?.toUpperCase();
  return src === 'PURCHASED' || src === 'BUY' ? 'off_shelf' : 'manufactured';
}

/** Returns only PART and ASSEMBLY rows, flat list. */
export function processBomItems(items: OnshapeBomItem[]): ProcessedBomPart[] {
  return items
    .filter((i) => i.itemType === 'PART' || i.itemType === 'ASSEMBLY')
    .map((i) => ({
      name:        i.name,
      partId:      i.partId ?? null,
      documentId:  i.documentId,
      workspaceId: i.workspaceId,
      elementId:   i.elementId,
      quantity:    i.quantity ?? 1,
      type:        classifyItem(i),
      itemType:    i.itemType as 'PART' | 'ASSEMBLY',
    }));
}

/**
 * Aggregate duplicate (documentId + elementId + partId) entries
 * that appear multiple times in a flat BOM by summing quantities.
 */
export function dedupeBomItems(items: ProcessedBomPart[]): ProcessedBomPart[] {
  const map = new Map<string, ProcessedBomPart>();
  for (const item of items) {
    const key = `${item.documentId}/${item.elementId}/${item.partId ?? '__asm__'}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      map.set(key, { ...item });
    }
  }
  return Array.from(map.values());
}

/** Build a human-readable key for uniqueness checking in the diff. */
export function bomItemKey(item: ProcessedBomPart): string {
  return `${item.documentId}/${item.elementId}/${item.partId ?? '__asm__'}`;
}
