'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Route error boundary (FE-004). A render crash on any page lands here instead
 * of Next's generic "Application error" screen; "Try again" re-renders the
 * segment. The digest lets support match the server log entry.
 */
export default function RouteError({
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
    <main
      role="alert"
      data-testid="route-error"
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center"
    >
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold text-content-default">Something went wrong</h1>
        <p className="max-w-sm text-sm text-content-subtle">
          This page hit an unexpected error. Try again, or head back to the dashboard.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-content-subtle">Reference: {error.digest}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-content-default hover:bg-surface-hover"
        >
          Back to Dashboard
        </Link>
      </div>
    </main>
  );
}
