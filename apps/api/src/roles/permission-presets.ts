/**
 * PERMISSION_PRESETS — derived from DEFAULT_ROLES so the two stay in sync.
 *
 * Each preset maps the canonical DEFAULT_ROLES entry (name → UPPER_SNAKE key)
 * plus a human-readable label. Callers use the `key` field to identify a
 * preset in `applyPreset(roleId, presetKey)`.
 */
import { DEFAULT_ROLES, type DefaultRoleSeed } from '../auth/services/default-roles.js';
import type { PermissionKey } from '@kpi-nexus/contracts';

export interface PermissionPreset {
  /** Stable identifier used as the `presetKey` argument. */
  key: string;
  /** Human-readable name matching the DEFAULT_ROLES name. */
  label: string;
  /** If true, the role gets the isAdmin bypass (overrides all permission checks). */
  isAdmin: boolean;
  /** The explicit permission list. Empty for Admin (isAdmin bypass covers all). */
  permissions: readonly PermissionKey[];
}

/** Map from DefaultRoleSeed name → stable preset key. */
const NAME_TO_KEY: Record<string, string> = {
  Admin: 'ADMIN',
  Manager: 'MANAGER',
  Employee: 'EMPLOYEE',
  Viewer: 'VIEWER',
};

/**
 * Derived from DEFAULT_ROLES — do not duplicate the permission lists here.
 * When DEFAULT_ROLES changes, PERMISSION_PRESETS updates automatically.
 */
export const PERMISSION_PRESETS: PermissionPreset[] = (DEFAULT_ROLES as readonly DefaultRoleSeed[]).map(
  (role) => ({
    key: NAME_TO_KEY[role.name] ?? role.name.toUpperCase(),
    label: role.name,
    isAdmin: role.isAdmin,
    permissions: role.permissions,
  }),
);

/** Look up a preset by key (case-sensitive). Returns undefined if not found. */
export function findPreset(key: string): PermissionPreset | undefined {
  return PERMISSION_PRESETS.find((p) => p.key === key);
}
