import Link from 'next/link';

/**
 * Unauthorized page — shown when a user navigates to a route they lack
 * permission to access. Guard components (`RequirePermission`,
 * `RequireAnyPermission`) redirect here when no `fallback` prop is provided.
 */
export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-2">
        <span className="text-5xl font-bold text-content-default" aria-hidden="true">
          403
        </span>
        <h1 className="text-2xl font-semibold text-content-default">
          You don&apos;t have access to this page
        </h1>
        <p className="max-w-sm text-sm text-content-subtle">
          Your account doesn&apos;t have the permissions required to view this
          content. If you believe this is a mistake, please contact your
          administrator.
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
