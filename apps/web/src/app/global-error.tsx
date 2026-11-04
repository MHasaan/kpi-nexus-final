'use client';

import './globals.css';

/**
 * Last-resort boundary for errors in the root layout itself (FE-004). It
 * replaces the layout, so it renders its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface-bg font-sans antialiased text-content-default">
        <main role="alert" className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
          <h1 className="text-2xl font-semibold">KPI Nexus is having trouble loading</h1>
          <p className="max-w-sm text-sm text-content-subtle">
            Something went wrong on our side. Try again in a moment.
          </p>
          {error.digest && <p className="font-mono text-xs text-content-subtle">Reference: {error.digest}</p>}
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
