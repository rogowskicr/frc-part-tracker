// OnShape REST API response types
// https://onshape-public.github.io/docs/api-intro/

export interface OnshapeSessionInfo {
  id: string;
  name: string;
  email: string;
  href: string;
}

export interface OnshapeBomItem {
  id: string;
  /** Display name of the part or assembly */
  name: string;
  /** Part number assigned in OnShape (may be empty) */
  partNumber: string;
  /** Total quantity at this level */
  quantity: number;
  /**
   * ORIGINAL = team-made (manufactured)
   * PURCHASED = off-the-shelf (COTS)
   * MAKE / BUY are legacy synonyms
   */
  itemSource: 'ORIGINAL' | 'PURCHASED' | 'MAKE' | 'BUY' | string;
  /** PART, ASSEMBLY, DOCUMENT, or VIRTUAL */
  itemType: 'PART' | 'ASSEMBLY' | 'DOCUMENT' | 'VIRTUAL' | string;
  /** Indent level in the BOM tree (0 = top level) */
  indent: number;
  /** OnShape part ID (null for assemblies) */
  partId: string | null;
  documentId: string;
  workspaceId: string;
  elementId: string;
  /** Raw BOM row number e.g. "1", "1.1" */
  item: string;
}

export interface OnshapeBomResponse {
  bomTable: {
    name: string;
    items: OnshapeBomItem[];
    headers: Array<{ id: string; name: string }>;
  };
}

export interface OnshapeDocument {
  id: string;
  name: string;
  href: string;
  defaultWorkspace: {
    id: string;
    name: string;
    type: string;
  };
}

export interface OnshapeDocumentListResponse {
  items: OnshapeDocument[];
  next?: string;
}

export interface OnshapeElement {
  id: string;
  name: string;
  elementType: 'ASSEMBLY' | 'PARTSTUDIO' | 'DRAWING' | string;
  type: string;
}

export interface OnshapeShadedView {
  /** base64-encoded PNG */
  viewData: string;
  mediaType: string;
}

export interface ParsedOnshapeUrl {
  documentId: string;
  workspaceType: 'w' | 'v' | 'm';
  workspaceId: string;
  elementId: string;
}
