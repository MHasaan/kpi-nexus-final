import { DeadEndActions } from '../../components/dead-end-actions';

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
          Your account isn&apos;t allowed to open it. If you think it should
          be, ask an administrator of your organisation — or sign out if this
          is the wrong account.
        </p>
      </div>

      <DeadEndActions />
    </main>
  );
}
