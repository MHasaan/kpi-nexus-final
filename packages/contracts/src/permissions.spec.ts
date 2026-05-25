import { describe, expect, test } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSION_COUNT,
  PermissionKey,
  PermissionKeySchema,
} from './permissions.js';

describe('PermissionKey', () => {
  test('exports exactly 18 canonical permissions (locked invariant per spec §5.2)', () => {
    expect(PERMISSION_COUNT).toBe(18);
    expect(ALL_PERMISSIONS).toHaveLength(PERMISSION_COUNT);
  });

  test('contains all expected categories', () => {
    const set = new Set<string>(ALL_PERMISSIONS);
    // KPIs
    expect(set.has(PermissionKey.KPI_VIEW)).toBe(true);
    expect(set.has(PermissionKey.KPI_CREATE)).toBe(true);
    expect(set.has(PermissionKey.KPI_EDIT)).toBe(true);
    expect(set.has(PermissionKey.KPI_DELETE)).toBe(true);
    expect(set.has(PermissionKey.KPI_DATA_ENTRY)).toBe(true);
    // Dashboards
    expect(set.has(PermissionKey.DASHBOARD_VIEW)).toBe(true);
    expect(set.has(PermissionKey.DASHBOARD_MANAGE)).toBe(true);
    // Users & RBAC
    expect(set.has(PermissionKey.USERS_VIEW)).toBe(true);
    expect(set.has(PermissionKey.USERS_MANAGE)).toBe(true);
    expect(set.has(PermissionKey.ROLES_MANAGE)).toBe(true);
    expect(set.has(PermissionKey.POSITIONS_MANAGE)).toBe(true);
    // Org structure
    expect(set.has(PermissionKey.GROUPS_VIEW)).toBe(true);
    expect(set.has(PermissionKey.GROUPS_MANAGE)).toBe(true);
    // Alerts
    expect(set.has(PermissionKey.ALERTS_VIEW)).toBe(true);
    // Insights
    expect(set.has(PermissionKey.REPORTS_VIEW)).toBe(true);
    expect(set.has(PermissionKey.ANALYTICS_VIEW)).toBe(true);
    expect(set.has(PermissionKey.INSIGHTS_VIEW)).toBe(true);
    // Admin
    expect(set.has(PermissionKey.ORG_SETTINGS)).toBe(true);
  });

  test('Zod schema accepts every PermissionKey value', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(PermissionKeySchema.safeParse(key).success).toBe(true);
    }
  });

  test('Zod schema rejects unknown permission strings and non-strings', () => {
    expect(PermissionKeySchema.safeParse('NOT_A_PERMISSION').success).toBe(false);
    expect(PermissionKeySchema.safeParse('').success).toBe(false);
    expect(PermissionKeySchema.safeParse(null).success).toBe(false);
    expect(PermissionKeySchema.safeParse(undefined).success).toBe(false);
    expect(PermissionKeySchema.safeParse(42).success).toBe(false);
  });

  test('all permission keys match the SCREAMING_SNAKE_CASE convention', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(key).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    }
  });

  test('permission values are unique', () => {
    const set = new Set(ALL_PERMISSIONS);
    expect(set.size).toBe(ALL_PERMISSIONS.length);
  });
});
