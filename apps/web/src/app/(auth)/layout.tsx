import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-content-strong">
            KPI Nexus
          </h1>
          <p className="mt-1 text-sm text-content-muted">Measure what matters.</p>
        </div>
        <div className="rounded-lg border border-border bg-surface-1 p-6 shadow-sm">
          {children}
        </div>
      </div>
    </main>
  );
}
