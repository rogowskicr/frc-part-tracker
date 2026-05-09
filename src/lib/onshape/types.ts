// OnShape REST API response types

export interface OnshapeItemSource {
  documentId: string;
  elementId: string;
  /** Absent on ASSEMBLY items — use !partId to detect sub-assemblies */
  partId?: string;
  wvmId: string;
  /** 'w' = workspace (team's own part), 'v' = versioned external doc (library/COTS) */
  wvmType: 'w' | 'v' | 'm';
  isStandardContent: boolean;
  configuration?: string;
  fullConfiguration?: string;
  viewHref?: string;
  partIdentity?: string;
  relatedOccurrences?: string[];
  indentLevel?: number;
}

export interface OnshapeBomItem {
  name: string;
  quantity: number;
  itemSource: OnshapeItemSource;
  /** 'PART' | 'ASSEMBLY' — present in indented BOM; absent in flat BOM */
  itemType?: string;
  /** Depth in assembly tree — present when fetched with indented=true */
  indent?: number;
  description?: string;
  partNumber?: string;
  vendor?: string;
  item?: string;
  excludeFromBom?: boolean;
  material?: { displayName?: string; id?: string };
  [key: string]: unknown;
}

export interface OnshapeBomResponse {
  bomTable: {
    name: string;
    items: OnshapeBomItem[];
    headers?: Array<{ id: string; name: string }>;
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
  viewData: string; // base64 PNG
  mediaType: string;
}

export interface ParsedOnshapeUrl {
  documentId: string;
  workspaceType: 'w' | 'v' | 'm';
  workspaceId: string;
  elementId: string;
}
