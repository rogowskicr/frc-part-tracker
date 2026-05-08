'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4">
      <p className="text-4xl mb-4">⚠</p>
      <h2 className="text-xl font-bold text-gray-100 mb-2">Something went wrong</h2>
      <p className="text-gray-400 text-sm mb-6 max-w-sm">
        An unexpected error occurred. This may be a temporary network issue.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2 bg-gray-800 border border-gray-600 text-gray-200 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
