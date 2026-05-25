/**
 * 72-case RBAC truth table — P1 exit criterion (spec §5.3 + §5.7).
 *
 * The four default roles seeded by registerOrganization × the 18 canonical
 * PermissionKeys = 72 (role, permission) tuples. For each tuple the test
 * asserts the principal's effective access matches the spec, using the same
 * resolution logic the PermissionsGuard relies on:
 *
 *     isAllowed(role, permission) :=
 *         role.isAdmin || role.permissions.includes(permission)
 *
 * This is a pure data test (no Prisma, no NestJS bootstrap). When P1's
 * DEFAULT_ROLES shape drifts from the spec, this fails first — before any
 * integration test or e2e.
 */
import { describe, expect, test } from 'vitest';

import { ALL_PERMISSIONS, PermissionKey } from '@kpi-nexus/contracts';

import { DEFAULT_ROLES } from './default-roles.js';

const ROLE_NAMES = ['Admin', 'Manager', 'Employee', 'Viewer'] as const;
type RoleName = (typeof ROLE_NAMES)[number];

function getRole(name: RoleName) {
  const role = DEFAULT_ROLES.find((r) => r.name === name);
  if (!role) throw new Error(`Default role missing: ${name}`);
  return role;
}

function isAllowed(roleName: RoleName, permission: string): boolean {
  const role = getRole(roleName);
  return role.isAdmin || role.permissions.includes(permission as PermissionKey);
}

/**
 * Expected access per spec §5.3 + §5.7. Admin is omitted — the test below
 * derives "all permissions" automatically from isAdmin=true.
 */
const EXPECTED_ALLOWED: Record<Exclude<RoleName, 'Admin'>, readonly PermissionKey[]> = {
  Manager: [
    PermissionKey.KPI_VIEW,
    PermissionKey.KPI_CREATE,
    PermissionKey.KPI_EDIT,
    PermissionKey.KPI_DATA_ENTRY,
    PermissionKey.DASHBOARD_VIEW,
    PermissionKey.DASHBOARD_MANAGE,
    PermissionKey.USERS_VIEW,
    PermissionKey.GROUPS_VIEW,
    PermissionKey.ALERTS_VIEW,
    PermissionKey.REPORTS_VIEW,
    PermissionKey.ANALYTICS_VIEW,
    PermissionKey.INSIGHTS_VIEW,
  ],
  Employee: [
    PermissionKey.KPI_VIEW,
    PermissionKey.KPI_DATA_ENTRY,
    PermissionKey.DASHBOARD_VIEW,
    PermissionKey.ALERTS_VIEW,
  ],
  Viewer: [
    PermissionKey.KPI_VIEW,
    PermissionKey.DASHBOARD_VIEW,
    PermissionKey.REPORTS_VIEW,
  ],
};

describe('DEFAULT_ROLES seed shape', () => {
  test('seeds exactly the four canonical roles', () => {
    expect(DEFAULT_ROLES.map((r) => r.name).sort()).toEqual(
      ['Admin', 'Employee', 'Manager', 'Viewer'].sort(),
    );
  });

  test('Admin uses the isAdmin bypass with an empty permissions array', () => {
    const admin = getRole('Admin');
    expect(admin.isAdmin).toBe(true);
    expect(admin.permissions).toEqual([]);
  });

  test('non-admin roles never set isAdmin=true', () => {
    for (const name of ['Manager', 'Employee', 'Viewer'] as const) {
      expect(getRole(name).isAdmin).toBe(false);
    }
  });

  test('every permission listed in a role is a valid PermissionKey', () => {
    const valid = new Set<string>(ALL_PERMISSIONS);
    for (const role of DEFAULT_ROLES) {
      for (const perm of role.permissions) {
        expect(valid.has(perm)).toBe(true);
      }
    }
  });

  test('display levels are monotonic (Admin > Manager > Employee > Viewer)', () => {
    expect(getRole('Admin').level).toBeGreaterThan(getRole('Manager').level);
    expect(getRole('Manager').level).toBeGreaterThan(getRole('Employee').level);
    expect(getRole('Employee').level).toBeGreaterThan(getRole('Viewer').level);
  });
});

describe('72-case RBAC truth table (4 roles × 18 permissions)', () => {
  test('exactly 72 cases (sanity)', () => {
    expect(ROLE_NAMES.length * ALL_PERMISSIONS.length).toBe(72);
  });

  describe('Admin (isAdmin bypass — every permission allowed)', () => {
    test.each(ALL_PERMISSIONS.map((p) => [p] as const))('Admin × %s → allowed', (perm) => {
      expect(isAllowed('Admin', perm)).toBe(true);
    });
  });

  describe('Manager (12 explicit permissions per spec §5.7)', () => {
    const allowed = new Set<string>(EXPECTED_ALLOWED.Manager);
    test.each(ALL_PERMISSIONS.map((p) => [p, allowed.has(p)] as const))(
      'Manager × %s → %s',
      (perm, expected) => {
        expect(isAllowed('Manager', perm)).toBe(expected);
      },
    );
  });

  describe('Employee (4 explicit permissions — KPI_VIEW, KPI_DATA_ENTRY, DASHBOARD_VIEW, ALERTS_VIEW)', () => {
    const allowed = new Set<string>(EXPECTED_ALLOWED.Employee);
    test.each(ALL_PERMISSIONS.map((p) => [p, allowed.has(p)] as const))(
      'Employee × %s → %s',
      (perm, expected) => {
        expect(isAllowed('Employee', perm)).toBe(expected);
      },
    );
  });

  describe('Viewer (3 explicit permissions — KPI_VIEW, DASHBOARD_VIEW, REPORTS_VIEW)', () => {
    const allowed = new Set<string>(EXPECTED_ALLOWED.Viewer);
    test.each(ALL_PERMISSIONS.map((p) => [p, allowed.has(p)] as const))(
      'Viewer × %s → %s',
      (perm, expected) => {
        expect(isAllowed('Viewer', perm)).toBe(expected);
      },
    );
  });
});
