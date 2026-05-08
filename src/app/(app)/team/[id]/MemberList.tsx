'use client';

import { useState } from 'react';
import { updateMemberRole, removeTeamMember } from '@/app/actions/teams';

interface Member {
  user_id: string;
  user_name: string;
  role: string;
  joined_at: string;
}

interface Props {
  teamId: string;
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}

const ROLES = ['admin', 'engineer', 'viewer'] as const;
type Role = typeof ROLES[number];

const ROLE_COLORS: Record<Role, string> = {
  admin: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  engineer: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  viewer: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export default function MemberList({ teamId, members, currentUserId, isAdmin }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdating(userId);
    setErrors((e) => ({ ...e, [userId]: '' }));
    const result = await updateMemberRole(teamId, userId, newRole);
    if (result?.error) setErrors((e) => ({ ...e, [userId]: result.error! }));
    setUpdating(null);
  }

  async function handleRemove(userId: string, userName: string) {
    if (!confirm(`Remove ${userName} from this team?`)) return;
    setRemoving(userId);
    const result = await removeTeamMember(teamId, userId);
    if (result?.error) setErrors((e) => ({ ...e, [userId]: result.error! }));
    setRemoving(null);
  }

  return (
    <div className="divide-y divide-gray-700">
      {members.map((m) => {
        const isSelf = m.user_id === currentUserId;
        const canEdit = isAdmin && !isSelf;
        const initials = m.user_name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        return (
          <div key={m.user_id} className="flex items-center gap-4 py-3 px-1">
            {/* Avatar */}
            <div className="h-9 w-9 rounded-full bg-gray-700 flex items-center justify-center text-sm font-semibold text-gray-300 shrink-0">
              {initials}
            </div>

            {/* Name + joined date */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-100">{m.user_name}</span>
                {isSelf && <span className="text-xs text-gray-500">(you)</span>}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Joined {new Date(m.joined_at).toLocaleDateString()}
              </p>
            </div>

            {/* Role */}
            <div className="shrink-0">
              {canEdit ? (
                <select
                  value={m.role}
                  disabled={updating === m.user_id}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs font-medium border bg-gray-900 text-gray-200 border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r} className="capitalize">{r}</option>
                  ))}
                </select>
              ) : (
                <span className={`text-xs font-medium px-2 py-1 rounded-full border capitalize ${ROLE_COLORS[m.role as Role] ?? ROLE_COLORS.viewer}`}>
                  {m.role}
                </span>
              )}
            </div>

            {/* Remove button */}
            {canEdit && (
              <button
                onClick={() => handleRemove(m.user_id, m.user_name)}
                disabled={removing === m.user_id}
                className="shrink-0 px-2.5 py-1 bg-red-900/30 border border-red-700 text-red-300 rounded-lg text-xs font-medium hover:bg-red-900/60 disabled:opacity-50 transition-colors"
              >
                {removing === m.user_id ? '…' : 'Remove'}
              </button>
            )}

            {/* Per-row error */}
            {errors[m.user_id] && (
              <p className="text-xs text-red-400 shrink-0">{errors[m.user_id]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
