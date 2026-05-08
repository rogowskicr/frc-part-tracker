'use client';

import { useState } from 'react';
import Link from 'next/link';
import { joinAdditionalTeam, createAdditionalTeam, switchTeam, leaveTeam } from '@/app/actions/teams';
import CopyButton from './CopyButton';

export interface TeamMembership {
  teamId: string;
  teamName: string;
  joinCode: string;
  role: string;
}

interface Props {
  activeTeamId: string | null;
  memberships: TeamMembership[];
}

type PanelMode = null | 'join' | 'create';

export default function TeamsPanel({ activeTeamId, memberships }: Props) {
  const [mode, setMode] = useState<PanelMode>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [pendingLeave, setPendingLeave] = useState<string | null>(null);

  function openMode(next: PanelMode) {
    setMode(next);
    setActionError(null);
  }

  async function handleSwitch(teamId: string) {
    setPendingSwitch(teamId);
    await switchTeam(teamId);
    setPendingSwitch(null);
  }

  async function handleLeave(teamId: string, teamName: string) {
    if (!confirm(`Leave "${teamName}"?\n\nYou can rejoin anytime with the join code.`)) return;
    setPendingLeave(teamId);
    const result = await leaveTeam(teamId);
    if (result?.error) alert(result.error);
    setPendingLeave(null);
  }

  async function handleJoin(formData: FormData) {
    setActionLoading(true);
    setActionError(null);
    const result = await joinAdditionalTeam(formData);
    if (result?.error) {
      setActionError(result.error);
      setActionLoading(false);
    } else {
      setMode(null);
      setActionLoading(false);
    }
  }

  async function handleCreate(formData: FormData) {
    setActionLoading(true);
    setActionError(null);
    const result = await createAdditionalTeam(formData);
    if (result?.error) {
      setActionError(result.error);
      setActionLoading(false);
    } else {
      setMode(null);
      setActionLoading(false);
    }
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
      <h2 className="font-semibold text-gray-100">Your Teams</h2>

      {memberships.length === 0 && mode !== 'join' && mode !== 'create' && (
        <p className="text-sm text-gray-400">You are not on any team yet.</p>
      )}

      {/* Team cards */}
      {memberships.map((m) => {
        const isActive = m.teamId === activeTeamId;
        return (
          <div
            key={m.teamId}
            className={`rounded-lg border p-4 transition-colors ${
              isActive ? 'border-amber-500/50 bg-amber-900/10' : 'border-gray-700 bg-gray-900/40'
            }`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/team/${m.teamId}`} className="font-medium text-gray-100 hover:text-blue-400 transition-colors">
                    {m.teamName}
                  </Link>
                  {isActive && (
                    <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                  <span className="text-xs text-gray-500 capitalize">{m.role}</span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">Join code:</span>
                  <span className="font-mono text-sm font-bold text-amber-400 tracking-widest">{m.joinCode}</span>
                  <CopyButton text={m.joinCode} />
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isActive && (
                  <button
                    onClick={() => handleSwitch(m.teamId)}
                    disabled={pendingSwitch === m.teamId}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {pendingSwitch === m.teamId ? 'Switching…' : 'Switch'}
                  </button>
                )}
                <button
                  onClick={() => handleLeave(m.teamId, m.teamName)}
                  disabled={pendingLeave === m.teamId}
                  className="px-3 py-1.5 bg-red-900/30 border border-red-700 text-red-300 rounded-lg text-xs font-medium hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                >
                  {pendingLeave === m.teamId ? 'Leaving…' : 'Leave'}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Join form */}
      {mode === 'join' && (
        <form action={handleJoin} className="border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-200">Join a team</p>
          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          <div>
            <input
              name="join_code"
              type="text"
              required
              maxLength={6}
              placeholder="Join code"
              autoFocus
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase tracking-widest"
              onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Ask a team admin for their 6-character join code.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? 'Joining…' : 'Join'}
            </button>
            <button type="button" onClick={() => openMode(null)} className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Create form */}
      {mode === 'create' && (
        <form action={handleCreate} className="border border-gray-700 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-gray-200">Create a team</p>
          {actionError && <p className="text-xs text-red-400">{actionError}</p>}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Team Name</label>
            <input
              name="team_name"
              type="text"
              required
              placeholder="FRC Team 4450"
              autoFocus
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <p className="text-xs text-gray-500">
            Season years are added from the team page after creation.
          </p>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {actionLoading ? 'Creating…' : 'Create'}
            </button>
            <button type="button" onClick={() => openMode(null)} className="px-4 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-600 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Bottom action buttons — shown when no form is open */}
      {mode === null && (
        <div className="flex gap-2">
          <button
            onClick={() => openMode('join')}
            className="flex-1 py-2 border border-dashed border-gray-600 text-gray-400 rounded-lg text-sm hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            + Join a team
          </button>
          <button
            onClick={() => openMode('create')}
            className="flex-1 py-2 border border-dashed border-gray-600 text-gray-400 rounded-lg text-sm hover:border-gray-500 hover:text-gray-300 transition-colors"
          >
            + Create a team
          </button>
        </div>
      )}
    </div>
  );
}
