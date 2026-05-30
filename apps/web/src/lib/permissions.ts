/**
 * Permission utility functions + localStorage cache helpers.
 *
 * Kept as a pure module (no React) so it can be used from the hook,
 * guard components, and tests alike.
 */

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
