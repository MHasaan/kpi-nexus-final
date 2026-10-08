import Link from 'next/link';

/** 404 for unknown routes and `notFound()` calls (FE-004). Matches /unauthorized. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-5xl font-bold text-content-default" aria-hidden="true">
          404
        </span>
        <h1 className="text-2xl font-semibold text-content-default">Page not found</h1>
        <p className="max-w-sm text-sm text-content-subtle">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      >
        Back to Dashboard
      </Link>
    </main>
  );
}
