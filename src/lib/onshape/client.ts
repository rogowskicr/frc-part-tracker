// OnShape REST API client — HMAC-SHA256 key authentication
// Auth spec: https://onshape-public.github.io/docs/auth/apikeys/

import { createHmac, randomUUID } from 'crypto';

import type {
  OnshapeSessionInfo,
  OnshapeBomResponse,
  OnshapeDocumentListResponse,
  OnshapeElement,
  OnshapeShadedView,
  ParsedOnshapeUrl,
} from './types';

const BASE_URL = 'https://cad.onshape.com';

export interface OnshapeCredentials {
  accessKey: string;
  secretKey: string;
}

// Parse an OnShape document URL into its component IDs.
export function parseOnshapeUrl(url: string): ParsedOnshapeUrl | null {
  const m = url.match(
    /\/documents\/([0-9a-f]+)\/(w|v|m)\/([0-9a-f]+)\/e\/([0-9a-f]+)/i,
  );
  if (!m) return null;
  return {
    documentId:    m[1],
    workspaceType: m[2] as 'w' | 'v' | 'm',
    workspaceId:   m[3],
    elementId:     m[4],
  };
}

// Build the HMAC-SHA256 Authorization header required by OnShape API keys.
// Spec: https://onshape-public.github.io/docs/auth/apikeys/
//
// Required headers:  Authorization, Date, On-Nonce
// Auth format:       On <accessKey>:HmacSHA256:<base64sig>
// String to sign:    method\nnonce\ndate\ncontent-type\npath\nquery\n  (all lowercase)
function buildHeaders(
  method: string,
  path: string,
  query: string,
  creds: OnshapeCredentials,
): HeadersInit {
  // Nonce: alphanumeric, ≥16 chars, unique per request
  const nonce       = randomUUID().replace(/-/g, ''); // 32 hex chars
  const date        = new Date().toUTCString();
  const contentType = method.toUpperCase() === 'GET' ? '' : 'application/json';

  // Entire string is lowercased; trailing \n is required
  const stringToSign = (
    method      + '\n' +
    nonce       + '\n' +
    date        + '\n' +
    contentType + '\n' +
    path        + '\n' +
    query       + '\n'
  ).toLowerCase();

  const signature = createHmac('sha256', creds.secretKey)
    .update(stringToSign)
    .digest('base64');

  const headers: HeadersInit = {
    Authorization: `On ${creds.accessKey}:HmacSHA256:${signature}`,
    Date:          date,
    'On-Nonce':    nonce,
    Accept:        'application/json;charset=UTF-8',
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}

async function apiFetch<T>(
  method: string,
  path: string,
  queryParams: Record<string, string>,
  creds: OnshapeCredentials,
  body?: unknown,
): Promise<T> {
  const qs      = new URLSearchParams(queryParams).toString();
  const apiPath = `/api/${path}`;
  const headers = buildHeaders(method, apiPath, qs, creds);
  const url     = `${BASE_URL}${apiPath}${qs ? `?${qs}` : ''}`;

  const res  = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  // Always read body as text first so we can include it in error messages
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`OnShape API error ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!text) {
    throw new Error(`OnShape returned an empty response (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`OnShape returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
}

export interface OnshapeConnectionResult {
  /** Number of documents visible to this API key */
  documentCount: number;
}

// users/sessioninfo returns 204 for API-key auth (no session). Use documents instead.
export async function testConnection(creds: OnshapeCredentials): Promise<OnshapeConnectionResult> {
  const res = await apiFetch<OnshapeDocumentListResponse>(
    'GET',
    'documents',
    { q: '', offset: '0', limit: '1' },
    creds,
  );
  return { documentCount: res.items?.length ?? 0 };
}

export async function listDocuments(
  creds: OnshapeCredentials,
  filter = '',
): Promise<OnshapeDocumentListResponse> {
  return apiFetch<OnshapeDocumentListResponse>('GET', 'documents', { q: filter, offset: '0', limit: '20' }, creds);
}

export async function listElements(
  { documentId, workspaceType, workspaceId }: ParsedOnshapeUrl,
  creds: OnshapeCredentials,
): Promise<OnshapeElement[]> {
  return apiFetch<OnshapeElement[]>(
    'GET',
    `documents/d/${documentId}/${workspaceType}/${workspaceId}/elements`,
    {},
    creds,
  );
}

export async function fetchBom(
  { documentId, workspaceType, workspaceId, elementId }: ParsedOnshapeUrl,
  creds: OnshapeCredentials,
): Promise<OnshapeBomResponse> {
  return apiFetch<OnshapeBomResponse>(
    'GET',
    `assemblies/d/${documentId}/${workspaceType}/${workspaceId}/e/${elementId}/bom`,
    { indented: 'false', multiLevel: 'false' },
    creds,
  );
}

export async function fetchShadedView(
  docId: string,
  workspaceType: string,
  workspaceId: string,
  elementId: string,
  partId: string,
  creds: OnshapeCredentials,
): Promise<OnshapeShadedView[]> {
  return apiFetch<OnshapeShadedView[]>(
    'GET',
    `parts/d/${docId}/${workspaceType}/${workspaceId}/e/${elementId}/partid/${partId}/shadedviews`,
    { viewMatrix: 'front', outputHeight: '200', outputWidth: '200', pixelSize: '0' },
    creds,
  );
}
