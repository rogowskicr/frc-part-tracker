'use client';

import { useRef, useState } from 'react';
import { saveOnshapeCredentials } from '@/app/actions/onshape';

interface Props {
  teamId: string;
  isAdmin: boolean;
  hasCredentials: boolean;
}

export default function OnshapeCredentials({
  teamId,
  isAdmin,
  hasCredentials,
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  const handleTest = async () => {
    if (!formRef.current) return;

    const formData = new FormData(formRef.current);
    const access_key = formData.get('access_key') as string;
    const secret_key = formData.get('secret_key') as string;

    if (!access_key || !secret_key) {
      setTestStatus('error');
      setTestMessage('Please enter both access key and secret key');
      return;
    }

    setTestStatus('testing');
    setTestMessage('');

    try {
      const response = await fetch('/api/onshape/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key, secret_key }),
      });

      const data = await response.json();

      if (response.ok) {
        setTestStatus('ok');
        setTestMessage(
          data.document_count === 1
            ? 'Connected — 1 document accessible'
            : `Connected — ${data.document_count} documents accessible`,
        );
      } else {
        setTestStatus('error');
        setTestMessage(data.error || 'Connection failed');
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(
        error instanceof Error ? error.message : 'Connection test failed'
      );
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formRef.current) return;

    setSaving(true);
    setSaveMessage('');

    try {
      const formData = new FormData(formRef.current);
      const result = await saveOnshapeCredentials(teamId, formData);

      if (result.success) {
        setSaveMessage('Credentials saved successfully');
        setTestStatus('idle');
        setTestMessage('');
        formRef.current.reset();
      } else {
        setSaveMessage(result.error ?? 'Failed to save credentials');
      }
    } catch (error) {
      setSaveMessage(
        error instanceof Error ? error.message : 'Failed to save credentials'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-100">
          OnShape Integration
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Connect OnShape to enable BOM import and part sync.
        </p>
      </div>

      {!isAdmin ? (
        /* Read-only status for non-admins */
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${
              hasCredentials ? 'bg-green-500' : 'bg-gray-500'
            }`}
          />
          <span className="text-sm text-gray-300">
            {hasCredentials ? 'Credentials configured' : 'Not configured'}
          </span>
        </div>
      ) : (
        /* Admin form */
        <form ref={formRef} onSubmit={handleSave} className="space-y-4">
          {/* Access Key Input */}
          <div>
            <label
              htmlFor="access_key"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Access Key
            </label>
            <input
              type="text"
              id="access_key"
              name="access_key"
              placeholder="Your OnShape access key"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Secret Key Input */}
          <div>
            <label
              htmlFor="secret_key"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Secret Key
            </label>
            <input
              type="password"
              id="secret_key"
              name="secret_key"
              placeholder="Your OnShape secret key"
              className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {/* Test and Save Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing'}
              className="rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:border-gray-500 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {/* Test Status Message */}
          {testMessage && (
            <div
              className={`rounded-lg p-3 text-sm ${
                testStatus === 'ok'
                  ? 'border border-green-600 bg-green-900/30 text-green-300'
                  : 'border border-amber-600 bg-amber-900/30 text-amber-300'
              }`}
            >
              {testMessage}
            </div>
          )}

          {/* Save Status Message */}
          {saveMessage && (
            <div
              className={`rounded-lg p-3 text-sm ${
                saveMessage.includes('successfully')
                  ? 'border border-green-600 bg-green-900/30 text-green-300'
                  : 'border border-amber-600 bg-amber-900/30 text-amber-300'
              }`}
            >
              {saveMessage}
            </div>
          )}

          {/* Current Status Indicator */}
          <div className="border-t border-gray-700 pt-4 mt-4">
            <div className="flex items-center gap-3">
              <div
                className={`h-3 w-3 rounded-full ${
                  hasCredentials ? 'bg-green-500' : 'bg-gray-500'
                }`}
              />
              <span className="text-sm text-gray-400">
                {hasCredentials ? 'Currently configured' : 'Not configured'}
              </span>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
