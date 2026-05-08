'use client';

import { useState } from 'react';
import { addTeamProject, removeTeamProject, setActiveProject } from '@/app/actions/teams';
import { projectCode, getCurrentSeasonYear } from '@/lib/validation';

export interface TeamProject {
  year: number;
  suffix: string;
}

interface Props {
  teamId: string;
  projects: TeamProject[];
  activeCode: string | null;
  isAdmin: boolean;
  currentUserId: string;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Returns the next suffix to suggest for a given year. '' = base project, 'A'/'B'/… = lettered. */
function suggestSuffix(existing: TeamProject[], year: number): string {
  const used = existing.filter((p) => p.year === year).map((p) => p.suffix);
  if (!used.includes('')) return '';
  for (const ch of LETTERS) {
    if (!used.includes(ch)) return ch;
  }
  return '';
}

export default function ProjectPanel({
  teamId,
  projects,
  activeCode,
  isAdmin,
  currentUserId,
}: Props) {
  const [error, setError]     = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newYear, setNewYear]     = useState<number>(getCurrentSeasonYear());
  const [newSuffix, setNewSuffix] = useState<string>(suggestSuffix(projects, getCurrentSeasonYear()));

  function handleYearChange(year: number) {
    setNewYear(year);
    setNewSuffix(suggestSuffix(projects, year));
  }

  function handleSuffixInput(raw: string) {
    // Allow only a single uppercase letter, or empty (base project)
    const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
    setNewSuffix(cleaned);
  }

  async function handleSwitch(code: string | null) {
    setPending(code ?? 'clear');
    setError(null);
    const result = await setActiveProject(code);
    if (result?.error) setError(result.error);
    setPending(null);
  }

  async function handleAdd() {
    setPending('add');
    setError(null);
    const result = await addTeamProject(teamId, newYear, newSuffix, currentUserId);
    if (result?.error) {
      setError(result.error);
    } else {
      setShowAdd(false);
    }
    setPending(null);
  }

  async function handleRemove(p: TeamProject) {
    const code = projectCode(p.year, p.suffix);
    const label = p.suffix ? `${p.year}-${p.suffix}` : String(p.year);
    if (!confirm(`Remove project ${code} (${label})?\nThis does not delete any parts or assemblies.`)) return;
    setPending(`remove-${code}`);
    setError(null);
    const result = await removeTeamProject(teamId, p.year, p.suffix, currentUserId);
    if (result?.error) setError(result.error);
    setPending(null);
  }

  const previewCode = projectCode(newYear, newSuffix);

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-100">Projects</h2>
          {isAdmin && (
            <p className="text-xs text-gray-400 mt-0.5">
              Add a project to create a new work context. Members can switch their active project below.
            </p>
          )}
        </div>
        {isAdmin && !showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shrink-0"
          >
            + Add Project
          </button>
        )}
      </div>

      <div className="px-5 py-3 space-y-3">
        {error && <p className="text-xs text-red-400">{error}</p>}

        {projects.length === 0 && !showAdd && (
          <p className="text-sm text-gray-400 py-2">
            No projects added yet.
            {isAdmin
              ? ' Use "+ Add Project" to create the first one.'
              : ' Ask a team admin to add a project.'}
          </p>
        )}

        {projects.map((p) => {
          const code     = projectCode(p.year, p.suffix);
          const isActive = code === activeCode;
          const label    = p.suffix ? `${p.year} · ${p.suffix}` : String(p.year);

          return (
            <div
              key={code}
              className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                isActive
                  ? 'border-amber-500/50 bg-amber-900/10'
                  : 'border-gray-700 bg-gray-900/40'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-bold text-gray-100 text-sm">{code}</span>
                <span className="text-xs text-gray-400">{label}</span>
                {isActive && (
                  <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full shrink-0">
                    Active
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isActive ? (
                  <button
                    onClick={() => handleSwitch(null)}
                    disabled={pending === 'clear'}
                    className="px-3 py-1 bg-gray-700 border border-gray-600 text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-600 disabled:opacity-50 transition-colors"
                  >
                    {pending === 'clear' ? '…' : 'View All'}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSwitch(code)}
                    disabled={pending === code}
                    className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {pending === code ? '…' : 'Switch'}
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => handleRemove(p)}
                    disabled={pending === `remove-${code}`}
                    className="px-2.5 py-1 bg-red-900/30 border border-red-700 text-red-300 rounded-lg text-xs font-medium hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                  >
                    {pending === `remove-${code}` ? '…' : 'Remove'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* Add project form — admin only */}
        {isAdmin && showAdd && (
          <div className="border border-gray-700 rounded-lg p-4 space-y-4 mt-1">
            <p className="text-sm font-medium text-gray-200">Add Project</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Year</label>
                <input
                  type="number"
                  value={newYear}
                  onChange={(e) => handleYearChange(parseInt(e.target.value, 10))}
                  min={2000}
                  max={2099}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Letter suffix <span className="text-gray-500">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newSuffix}
                  onChange={(e) => handleSuffixInput(e.target.value)}
                  maxLength={1}
                  placeholder="None (base project)"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 font-mono uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans"
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gray-900 border border-gray-700 text-sm">
              <span className="text-gray-400">Project code: </span>
              <span className="font-mono font-bold text-amber-400">{previewCode}</span>
              <span className="text-gray-500 ml-2">
                → parts like{' '}
                <span className="font-mono">{previewCode}_A_100</span>
              </span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={pending === 'add'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {pending === 'add' ? 'Adding…' : 'Add Project'}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
