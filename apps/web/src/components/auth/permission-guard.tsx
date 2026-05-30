'use client';

import type { ReactNode } from 'react';

import { usePermissions } from '../../lib/use-permissions';

// ---------------------------------------------------------------------------
// PermissionGuard — inline element / button wrapper
// ---------------------------------------------------------------------------

interface PermissionGuardProps {
  /** The single permission key required to render children. */
  permission: string;
  children: ReactNode;
}

/**
 * Renders `children` only when the current user has `permission`.
 * Renders `null` otherwise (including while permissions are loading).
 *
 * Use this for inline elements such as action buttons where a redirect or
 * fallback is not appropriate — the element simply disappears when the user
 * lacks the permission.
 *
 * @example
 * ```tsx
 * <PermissionGuard permission="kpi:write">
 *   <Button onClick={handleCreate}>Create KPI</Button>
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({ permission, children }: PermissionGuardProps) {
  const { has } = usePermissions();
  if (!has(permission)) return null;
  return <>{children}</>;
}
