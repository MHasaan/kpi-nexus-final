import { describe, expect, test } from 'vitest';

import {
  buildKpiVisibilityWhere,
  type KpiVisibilityContext,
  type KpiVisibilityOrBranch,
} from './kpi-visibility.js';

const ORG = 'org_acme';

// The four default roles each get a representative principal context:
const ADMIN: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_admin',
  isAdmin: true,
  managedOrgUnitIds: [],
  directReportIds: [],
  memberOrgUnitIds: [],
};

const MANAGER: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_manager',
  isAdmin: false,
  managedOrgUnitIds: ['unit_sales_us', 'unit_sales_emea'],
  directReportIds: ['u_rep1', 'u_rep2', 'u_rep3'],
  memberOrgUnitIds: ['unit_sales_global'],
};

const EMPLOYEE: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_employee',
  isAdmin: false,
  managedOrgUnitIds: [],
  directReportIds: [],
  memberOrgUnitIds: ['unit_sales_us'],
};

const VIEWER: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_viewer',
  isAdmin: false,
  managedOrgUnitIds: [],
  directReportIds: [],
  memberOrgUnitIds: ['unit_sales_us'],
};

function getOrgWideBranch(branches: KpiVisibilityOrBranch[] | undefined): KpiVisibilityOrBranch | undefined {
  return branches?.find((b) => b.scope === 'ORG_WIDE');
}

function getPerUnitBranch(
  branches: KpiVisibilityOrBranch[] | undefined,
): Extract<KpiVisibilityOrBranch, { scope: 'PER_UNIT' }> | undefined {
  return branches?.find((b): b is Extract<KpiVisibilityOrBranch, { scope: 'PER_UNIT' }> => b.scope === 'PER_UNIT');
}

function getPerUserBranch(
  branches: KpiVisibilityOrBranch[] | undefined,
): Extract<KpiVisibilityOrBranch, { scope: 'PER_USER' }> | undefined {
  return branches?.find((b): b is Extract<KpiVisibilityOrBranch, { scope: 'PER_USER' }> => b.scope === 'PER_USER');
}

describe('buildKpiVisibilityWhere — 12-case matrix (spec §5.5 + §6)', () => {
  describe('Admin role (sees everything in tenant)', () => {
    const where = buildKpiVisibilityWhere(ADMIN);

    test('always filters by organizationId', () => {
      expect(where.organizationId).toBe(ORG);
    });

    test('ORG_WIDE: no scope branches required — admin tenant filter is sufficient', () => {
      expect(where.OR).toBeUndefined();
    });

    test('PER_UNIT: no scope branches — admin tenant filter is sufficient', () => {
      expect(where.OR).toBeUndefined();
    });

    test('PER_USER: no scope branches — admin tenant filter is sufficient', () => {
      expect(where.OR).toBeUndefined();
    });
  });

  describe('Manager role (managed units + direct reports + ORG_WIDE)', () => {
    const where = buildKpiVisibilityWhere(MANAGER);

    test('ORG_WIDE: branch present so ORG_WIDE rows match', () => {
      expect(getOrgWideBranch(where.OR)).toBeDefined();
    });

    test('PER_UNIT: branch filters by managed + member orgUnitIds (deduped)', () => {
      const branch = getPerUnitBranch(where.OR);
      expect(branch).toBeDefined();
      const ids = branch?.orgUnitAssignments.some.orgUnitId.in ?? [];
      expect(new Set(ids)).toEqual(
        new Set(['unit_sales_us', 'unit_sales_emea', 'unit_sales_global']),
      );
    });

    test('PER_USER: branch filters by self + direct reports', () => {
      const branch = getPerUserBranch(where.OR);
      expect(branch).toBeDefined();
      const ids = branch?.userAssignments.some.userId.in ?? [];
      expect(new Set(ids)).toEqual(
        new Set(['u_manager', 'u_rep1', 'u_rep2', 'u_rep3']),
      );
    });
  });

  describe('Employee role (member units + self)', () => {
    const where = buildKpiVisibilityWhere(EMPLOYEE);

    test('ORG_WIDE: branch present', () => {
      expect(getOrgWideBranch(where.OR)).toBeDefined();
    });

    test('PER_UNIT: branch filters by member orgUnitIds only', () => {
      const branch = getPerUnitBranch(where.OR);
      expect(branch).toBeDefined();
      const ids = branch?.orgUnitAssignments.some.orgUnitId.in ?? [];
      expect([...ids]).toEqual(['unit_sales_us']);
    });

    test('PER_USER: branch filters by self only (no reports)', () => {
      const branch = getPerUserBranch(where.OR);
      expect(branch).toBeDefined();
      const ids = branch?.userAssignments.some.userId.in ?? [];
      expect([...ids]).toEqual(['u_employee']);
    });
  });

  describe('Viewer role (same visibility as Employee — mutation gated by perms only)', () => {
    const where = buildKpiVisibilityWhere(VIEWER);

    test('ORG_WIDE: branch present', () => {
      expect(getOrgWideBranch(where.OR)).toBeDefined();
    });

    test('PER_UNIT: branch filters by member orgUnitIds only', () => {
      const branch = getPerUnitBranch(where.OR);
      expect(branch).toBeDefined();
      const ids = branch?.orgUnitAssignments.some.orgUnitId.in ?? [];
      expect([...ids]).toEqual(['unit_sales_us']);
    });

    test('PER_USER: branch filters by self only', () => {
      const branch = getPerUserBranch(where.OR);
      expect(branch).toBeDefined();
      const ids = branch?.userAssignments.some.userId.in ?? [];
      expect([...ids]).toEqual(['u_viewer']);
    });
  });

  describe('boundary + dedup guarantees', () => {
    test('non-admin with no orgUnits omits the PER_UNIT branch entirely', () => {
      const where = buildKpiVisibilityWhere({
        organizationId: ORG,
        userId: 'u_solo',
        isAdmin: false,
        managedOrgUnitIds: [],
        directReportIds: [],
        memberOrgUnitIds: [],
      });
      expect(getPerUnitBranch(where.OR)).toBeUndefined();
      expect(getPerUserBranch(where.OR)?.userAssignments.some.userId.in).toEqual(['u_solo']);
    });

    test('manager who also manages a unit they belong to dedups it', () => {
      const where = buildKpiVisibilityWhere({
        organizationId: ORG,
        userId: 'u_pm',
        isAdmin: false,
        managedOrgUnitIds: ['team_a'],
        directReportIds: ['u_x'],
        memberOrgUnitIds: ['team_a'],
      });
      const ids = getPerUnitBranch(where.OR)?.orgUnitAssignments.some.orgUnitId.in ?? [];
      expect([...ids]).toEqual(['team_a']);
    });

    test('all branches use the same organizationId scoping at the outer level', () => {
      const where = buildKpiVisibilityWhere(MANAGER);
      expect(where.organizationId).toBe(ORG);
    });
  });
});
