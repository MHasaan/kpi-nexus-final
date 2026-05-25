import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-bg p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-5xl font-bold tracking-tight text-content-strong">
          KPI Nexus
        </h1>
        <p className="mt-3 text-lg text-content-muted">Measure what matters.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-md bg-accent-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-content-default hover:bg-surface-1"
          >
            Create organization
          </Link>
        </div>
      </div>
    </main>
  );
}
