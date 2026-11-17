'use client';

import { usePermissions } from './use-permissions';

/**
 * True once the person's permissions are known and include `permission`.
 *
 * A page uses it to hold its own requests until then: a guard around the
 * markup hides the page from someone without access, but the page's load
 * effect runs regardless, so the API was asked — and refused — first.
 */
export function useAllowed(permission: string): boolean {
  const { ready, has } = usePermissions();
  return ready && has(permission);
}

/** True once the person's permissions are known and include at least one of `permissions`. */
export function useAllowedAny(permissions: readonly string[]): boolean {
  const { ready, hasAny } = usePermissions();
  return ready && hasAny([...permissions]);
}
