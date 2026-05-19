'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { linkAssemblyToOnshape, unlinkAssemblyFromOnshape } from '@/app/actions/onshape';

interface SyncDiff {
  diffId: string;
  added:   { name: string; quantity: number; type: string }[];
  removed: { name: string; partId: string }[];
  changed: { name: string; partId: string; oldQty: number; newQty: number }[];
  noChanges: boolean;
}

interface Props {
  assemblyId: string;
  canMutate: boolean;
  hasOnshapeCredentials: boolean;
  currentDocId:       string | null;
  currentWorkspaceId: string | null;
  currentElementId:   string | null;
  lastSync:           string | null;
}

type PanelState = 'idle' | 'link' | 'importing' | 'syncing' | 'diff';

export default function OnshapePanel({
  assemblyId,
  canMutate,
  hasOnshapeCredentials,
  currentDocId,
  currentWorkspaceId,
  currentElementId,
  lastSync,
}: Props) {
  const isLinked = !!(currentDocId && currentWorkspaceId && currentElementId);
  const router = useRouter();

  const [panelState, setPanelState]   = useState<PanelState>('idle');
  const [applying, setApplying]       = useState(false);
  const [urlInput, setUrlInput]       = useState('');
  const [linkError, setLinkError]     = useState('');
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [importError, setImportError]   = useState('');
  const [diff, setDiff]               = useState<SyncDiff | null>(null);
  const [applyResult, setApplyResult] = useState<string>('');
  const [applyError, setApplyError]   = useState('');

  // ── Link form ──────────────────────────────────────────────────────────────

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkError('');
    const result = await linkAssemblyToOnshape(assemblyId, urlInput);
    if (result.error) {
      setLinkError(result.error);
    } else {
      setPanelState('idle');
      setUrlInput('');
    }
  }

  async function handleUnlink() {
    if (!confirm('Remove OnShape link? Existing parts will remain but sync will no longer work.')) return;
    await unlinkAssemblyFromOnshape(assemblyId);
  }

  // ── BOM Import ────────────────────────────────────────────────────────────

  async function handleImport() {
    setPanelState('importing');
    setImportError('');
    setImportResult(null);
    try {
      const res  = await fetch('/api/onshape/import', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assemblyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setImportResult({ created: data.created, updated: data.updated, skipped: data.skipped });
      router.refresh();
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setPanelState('idle');
    }
  }

  // ── Sync diff ─────────────────────────────────────────────────────────────

  async function handleSyncDiff() {
    setPanelState('syncing');
    setDiff(null);
    setApplyResult('');
    setApplyError('');
    try {
      const res  = await fetch(`/api/onshape/sync-diff?assemblyId=${assemblyId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync diff failed');
      setDiff(data as SyncDiff);
      setPanelState('diff');
    } catch (err) {
      setImportError((err as Error).message);
      setPanelState('idle');
    }
  }

  // ── Apply diff ────────────────────────────────────────────────────────────

  async function handleApply() {
    if (!diff?.diffId) return;
    setApplying(true);
    setApplyError('');
    try {
      const res  = await fetch('/api/onshape/sync-apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ diffId: diff.diffId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Apply failed');
      setApplyResult(
        `Applied: +${data.added} added, ${data.changed} updated, ${data.removed} set to On Hold`,
      );
      setDiff(null);
      setPanelState('idle');
      router.refresh();
    } catch (err) {
      setApplyError((err as Error).message);
    } finally {
      setApplying(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const busy = panelState === 'importing' || panelState === 'syncing' || applying;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold text-gray-100">OnShape</h2>
          {isLinked && lastSync && (
            <p className="text-xs text-gray-500 mt-0.5">
              Last sync: {new Date(lastSync).toLocaleString()}
            </p>
          )}
          {isLinked && !lastSync && (
            <p className="text-xs text-gray-500 mt-0.5">Not yet synced</p>
          )}
        </div>

        {canMutate && (
          <div className="flex gap-2 flex-wrap">
            {!isLinked ? (
              <button
                onClick={() => setPanelState(panelState === 'link' ? 'idle' : 'link')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Link Document
              </button>
            ) : (
              <>
                {!hasOnshapeCredentials ? (
                  <span className="text-xs text-gray-500 self-center">Configure API keys on team page</span>
                ) : (
                  <>
                    <button
                      onClick={handleImport}
                      disabled={busy}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {panelState === 'importing' ? 'Importing…' : 'Import BOM'}
                    </button>
                    <button
                      onClick={handleSyncDiff}
                      disabled={busy}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      {panelState === 'syncing' ? 'Checking…' : 'Check Sync'}
                    </button>
                  </>
                )}
                <button
                  onClick={handleUnlink}
                  disabled={busy}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-700 disabled:opacity-50 transition-colors"
                >
                  Unlink
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4 text-sm">

        {/* Link form */}
        {panelState === 'link' && (
          <form onSubmit={handleLink} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                OnShape Assembly URL
              </label>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://cad.onshape.com/documents/…/w/…/e/…"
                className="w-full px-3 py-2 text-xs bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Open the assembly tab in OnShape and paste the full browser URL.
              </p>
            </div>
            {linkError && <p className="text-xs text-red-400">{linkError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Link
              </button>
              <button
                type="button"
                onClick={() => { setPanelState('idle'); setLinkError(''); }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Linked status */}
        {isLinked && panelState !== 'link' && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-xs text-gray-400 font-mono truncate">{currentDocId}</span>
          </div>
        )}

        {!isLinked && panelState !== 'link' && (
          <p className="text-xs text-gray-500">
            {canMutate
              ? 'Link this assembly to an OnShape document to enable BOM import.'
              : 'Not linked to OnShape.'}
          </p>
        )}

        {/* Import result */}
        {importResult && (
          <div className="rounded-lg p-3 bg-green-900/30 border border-green-700 text-green-300 text-xs">
            Import complete — {importResult.created} created, {importResult.updated} updated
            {importResult.skipped > 0 && `, ${importResult.skipped} skipped`}.
          </div>
        )}
        {importError && (
          <div className="rounded-lg p-3 bg-red-900/30 border border-red-700 text-red-300 text-xs">
            {importError}
          </div>
        )}

        {/* Apply result */}
        {applyResult && (
          <div className="rounded-lg p-3 bg-green-900/30 border border-green-700 text-green-300 text-xs">
            {applyResult}
          </div>
        )}
        {applyError && (
          <div className="rounded-lg p-3 bg-red-900/30 border border-red-700 text-red-300 text-xs">
            {applyError}
          </div>
        )}

        {/* Diff view */}
        {panelState === 'diff' && diff && (
          <div className="space-y-3">
            {diff.noChanges ? (
              <p className="text-xs text-gray-400">OnShape BOM matches the current parts list — no changes.</p>
            ) : (
              <>
                {diff.added.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-400 mb-1">
                      + {diff.added.length} new
                    </p>
                    <ul className="space-y-0.5">
                      {diff.added.map((a, i) => (
                        <li key={i} className="text-xs text-gray-300 flex justify-between">
                          <span>{a.name}</span>
                          <span className="text-gray-500">×{a.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.changed.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-yellow-400 mb-1">
                      ~ {diff.changed.length} qty changed
                    </p>
                    <ul className="space-y-0.5">
                      {diff.changed.map((c, i) => (
                        <li key={i} className="text-xs text-gray-300 flex justify-between">
                          <span>{c.name}</span>
                          <span className="text-gray-500">{c.oldQty} → {c.newQty}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.removed.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-400 mb-1">
                      − {diff.removed.length} removed
                    </p>
                    <ul className="space-y-0.5">
                      {diff.removed.map((r, i) => (
                        <li key={i} className="text-xs text-gray-300">{r.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleApply}
                    disabled={applying}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {applying ? 'Applying…' : 'Apply Changes'}
                  </button>
                  <button
                    onClick={() => { setDiff(null); setPanelState('idle'); }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
