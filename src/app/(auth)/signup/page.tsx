'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signup } from '@/app/actions/auth';

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'create' | 'join'>('create');

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set('mode', mode);
    const result = await signup(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <img src="/logo.png" alt="ORF 4450" className="h-20 w-20 object-contain mx-auto" />
        <h1 className="mt-4 text-2xl font-bold text-white">
          ORF 4450 <span className="text-amber-400">Part Tracker</span>
        </h1>
        <p className="mt-1 text-gray-400 text-sm font-medium tracking-wide uppercase">Olympia Robotics Federation</p>
        <p className="mt-2 text-gray-400">Create your account</p>
      </div>

      <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-800 border-t-2 border-t-amber-500 p-8">
        <form action={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-900/30 text-red-200 text-sm border border-red-800">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-200 mb-1">
              Your Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-200 mb-1">
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              minLength={3}
              autoComplete="username"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="jane_smith"
            />
            <p className="mt-1 text-xs text-gray-400">3-20 characters, letters and underscores only</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Min. 8 characters"
            />
          </div>

          <hr className="border-gray-700" />

          {/* Create / Join toggle */}
          <div>
            <p className="text-sm font-medium text-gray-200 mb-2">Team</p>
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  mode === 'create'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
              >
                Create a team
              </button>
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  mode === 'join'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700'
                }`}
              >
                Join a team
              </button>
            </div>

            {mode === 'create' && (
              <div>
                <label htmlFor="team_name" className="block text-sm font-medium text-gray-200 mb-1">
                  Team Name
                </label>
                <input
                  id="team_name"
                  name="team_name"
                  type="text"
                  required
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="FRC Team 4450"
                />
              </div>
            )}
          </div>

          {mode === 'join' && (
            <div>
              <label htmlFor="join_code" className="block text-sm font-medium text-gray-200 mb-1">
                Join Code
              </label>
              <input
                id="join_code"
                name="join_code"
                type="text"
                required
                maxLength={6}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono uppercase tracking-widest"
                placeholder="ABC123"
                onChange={(e) => { e.target.value = e.target.value.toUpperCase(); }}
              />
              <p className="mt-1 text-xs text-gray-400">
                Ask your team admin for the 6-character join code
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? mode === 'create' ? 'Creating team…' : 'Joining team…'
              : mode === 'create' ? 'Create account & team' : 'Join team'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-400 hover:text-blue-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
