'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import { usePermissions } from '../../lib/use-permissions';

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
  const { ready, has } = usePermissions();
  const router = useRouter();
  const granted = has(permission);

  useEffect(() => {
    if (ready && !granted && fallback === undefined) {
      router.replace('/unauthorized');
    }
    // `fallback` is intentionally omitted from the deps: it is only used as an
    // identity comparison in the guard condition, so re-running on its
    // reference change would cause needless effect churn.
  }, [ready, granted, router]);

  if (!ready) return null;
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
  const { ready, hasAny } = usePermissions();
  const router = useRouter();
  const granted = hasAny(permissions);

  useEffect(() => {
    if (ready && !granted && fallback === undefined) {
      router.replace('/unauthorized');
    }
    // `fallback` is intentionally omitted from the deps (identity-only use in
    // the condition above).
  }, [ready, granted, router]);

  if (!ready) return null;
  if (!granted) return fallback !== undefined ? <>{fallback}</> : null;
  return <>{children}</>;
}
