/**
 * Permission utility functions + localStorage cache helpers.
 *
 * Kept as a pure module (no React) so it can be used from the hook,
 * guard components, and tests alike.
 */

import type { PermissionKey } from '@kpi-nexus/contracts';

const PERMISSIONS_KEY = 'kpi-nexus.permissions';

// =============================================================================
// Pure predicate utils
// =============================================================================

/**
 * Returns true if `key` is present in `perms`.
 */
export function hasPermission(perms: string[], key: string): boolean {
  return perms.includes(key);
}

/**
 * Returns true if at least one element of `keys` is present in `perms`.
 */
export function hasAny(perms: string[], keys: string[]): boolean {
  return keys.some((k) => perms.includes(k));
}

// =============================================================================
// localStorage cache helpers (SSR-safe — all guard typeof window)
// =============================================================================

/**
 * Read the cached permissions array from localStorage.
 * Returns `[]` when the cache is absent, unparseable, or not an array.
 */
export function getCachedPermissions(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PERMISSIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as string[];
  } catch {
    return [];
  }
}

/**
 * Persist a permissions array to localStorage.
 */
export function setCachedPermissions(permissions: string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
}

/**
 * Remove the cached permissions (called on logout / clearTokens).
 */
export function clearCachedPermissions(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PERMISSIONS_KEY);
}

// =============================================================================
// Human-readable labels + domain grouping (Access Center capability matrix)
// =============================================================================

/**
 * Human label for every canonical permission. Typed `Record<PermissionKey, …>`
 * so adding a 26th permission to the contract is a compile error here until a
 * label is supplied.
 */
export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  KPI_VIEW: 'View KPIs',
  KPI_CREATE: 'Create KPIs',
  KPI_EDIT: 'Edit KPIs',
  KPI_DELETE: 'Delete KPIs',
  KPI_DATA_ENTRY: 'Enter KPI data',
  KPI_IMPORT: 'Bulk-import KPIs',
  DASHBOARD_VIEW: 'View dashboards',
  DASHBOARD_MANAGE: 'Manage dashboards',
  USERS_VIEW: 'View users',
  USERS_MANAGE: 'Manage users',
  ROLES_MANAGE: 'Manage roles',
  POSITIONS_MANAGE: 'Manage positions',
  GROUPS_VIEW: 'View teams',
  GROUPS_MANAGE: 'Manage teams',
  ALERTS_VIEW: 'View alerts',
  REPORTS_VIEW: 'View reports',
  REPORTS_MANAGE: 'Manage & schedule reports',
  ANALYTICS_VIEW: 'View analytics',
  ANALYTICS_FORECAST: 'Forecast & what-if',
  INSIGHTS_VIEW: 'View AI insights',
  EXPORTS: 'Export data',
  ORG_SETTINGS: 'Organization settings',
  AUDIT_VIEW: 'View audit log',
  INTEGRATIONS_MANAGE: 'Manage integrations',
  BILLING_MANAGE: 'Manage billing',
};

/** A human label for a permission, falling back to the raw key. */
export function permissionLabel(key: string): string {
  return PERMISSION_LABELS[key as PermissionKey] ?? key;
}

export interface PermissionGroup {
  heading: string;
  keys: PermissionKey[];
}

/**
 * Permissions grouped by domain for the capability matrix. The union of all
 * `keys` is exactly the 25 canonical permissions; mirrors the contract enum's
 * own section comments.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    heading: 'KPIs',
    keys: ['KPI_VIEW', 'KPI_CREATE', 'KPI_EDIT', 'KPI_DELETE', 'KPI_DATA_ENTRY', 'KPI_IMPORT'],
  },
  { heading: 'Dashboards', keys: ['DASHBOARD_VIEW', 'DASHBOARD_MANAGE'] },
  {
    heading: 'Users & Roles',
    keys: ['USERS_VIEW', 'USERS_MANAGE', 'ROLES_MANAGE', 'POSITIONS_MANAGE'],
  },
  { heading: 'Org structure', keys: ['GROUPS_VIEW', 'GROUPS_MANAGE'] },
  { heading: 'Alerts', keys: ['ALERTS_VIEW'] },
  {
    heading: 'Insights & Reports',
    keys: [
      'REPORTS_VIEW',
      'REPORTS_MANAGE',
      'ANALYTICS_VIEW',
      'ANALYTICS_FORECAST',
      'INSIGHTS_VIEW',
      'EXPORTS',
    ],
  },
  {
    heading: 'Administration',
    keys: ['ORG_SETTINGS', 'AUDIT_VIEW', 'INTEGRATIONS_MANAGE', 'BILLING_MANAGE'],
  },
];
