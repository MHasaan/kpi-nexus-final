'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { currentLoginRedirect } from '../../lib/auth-redirect';
import { usePermissions } from '../../lib/use-permissions';

/**
 * Shown when the permissions could not be fetched (the server or the network
 * failed). Sending the person to "/unauthorized" here told them they lacked
 * access when nothing was known either way.
 */
function AccessCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" data-testid="access-check-failed" className="mx-auto mt-16 flex max-w-sm flex-col items-center gap-3 px-4 text-center">
      <p className="text-base font-semibold text-content-strong">We could not check what you can open</p>
      <p className="text-sm text-content-muted">The server did not answer. Your access has not changed — try again in a moment.</p>
      <button
        type="button"
        onClick={onRetry}
        data-testid="access-check-retry"
        className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
      >
        Try again
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RequirePermission
// ---------------------------------------------------------------------------

interface RequirePermissionProps {
  /** The single permission key that must be present. */
  permission: string;
  /**
   * Rendered in place of children when the user lacks the permission.
   * When omitted, the user is redirected to `/unauthorized`.
   */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders `children` only when the current user has `permission`.
 *
 * While `!ready`, nothing is rendered (no flash of wrong content).
 * When denied and `fallback` is provided, renders `fallback`.
 * When denied and `fallback` is absent, redirects to `/unauthorized`.
 */
export function RequirePermission({
  permission,
  fallback,
  children,
}: RequirePermissionProps) {
  const { ready, authenticated, failed, retry, has } = usePermissions();
  const router = useRouter();
  const granted = has(permission);

  useEffect(() => {
    if (!ready) return;
    // Signed out (expired session, deep link): sign in and come back — not
    // "/unauthorized", which offers no way to sign in (FE-009).
    if (!authenticated) {
      router.replace(currentLoginRedirect());
      return;
    }
    // Could not find out what they may open: stay here and offer a retry.
    if (failed) return;
    if (!granted && fallback === undefined) {
      router.replace('/unauthorized');
    }
    // `fallback` is intentionally omitted from the deps: it is only used as an
    // identity comparison in the guard condition, so re-running on its
    // reference change would cause needless effect churn.
  }, [ready, authenticated, failed, granted, router]);

  if (!ready || !authenticated) return null;
  if (failed) return <AccessCheckFailed onRetry={retry} />;
  if (!granted) return fallback !== undefined ? <>{fallback}</> : null;
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// RequireAnyPermission
// ---------------------------------------------------------------------------

interface RequireAnyPermissionProps {
  /** The user must hold at least one of these permission keys. */
  permissions: string[];
  /**
   * Rendered in place of children when the user holds none of the permissions.
   * When omitted, the user is redirected to `/unauthorized`.
   */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders `children` when the current user has at least one of `permissions`.
 *
 * Behaviour while loading and on denial mirrors `RequirePermission`.
 */
export function RequireAnyPermission({
  permissions,
  fallback,
  children,
}: RequireAnyPermissionProps) {
  const { ready, authenticated, failed, retry, hasAny } = usePermissions();
  const router = useRouter();
  const granted = hasAny(permissions);

  useEffect(() => {
    if (!ready) return;
    // Signed out (expired session, deep link): sign in and come back — not
    // "/unauthorized", which offers no way to sign in (FE-009).
    if (!authenticated) {
      router.replace(currentLoginRedirect());
      return;
    }
    // Could not find out what they may open: stay here and offer a retry.
    if (failed) return;
    if (!granted && fallback === undefined) {
      router.replace('/unauthorized');
    }
    // `fallback` is intentionally omitted from the deps (identity-only use in
    // the condition above).
  }, [ready, authenticated, failed, granted, router]);

  if (!ready || !authenticated) return null;
  if (failed) return <AccessCheckFailed onRetry={retry} />;
  if (!granted) return fallback !== undefined ? <>{fallback}</> : null;
  return <>{children}</>;
}
