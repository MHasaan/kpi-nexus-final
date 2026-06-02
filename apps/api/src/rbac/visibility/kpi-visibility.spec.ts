import { describe, expect, test } from 'vitest';

import type { AccessProfile } from '@kpi-nexus/contracts';

import {
  buildKpiVisibilityWhere,
  kpiContextFromProfile,
  type KpiVisibilityContext,
  type KpiVisibilityOrBranch,
} from './kpi-visibility.js';

const ORG = 'org_acme';

// The four default roles each get a representative principal context:
const ADMIN: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_admin',
  isAdmin: true,
  scope: 'ORG',
  managedOrgUnitIds: [],
  directReportIds: [],
  memberOrgUnitIds: [],
  allowedCategoryIds: null,
};

// The default non-admin scope is UNITS — its mapping reproduces legacy behaviour,
// so the 12-case matrix below is unchanged (parity).
const MANAGER: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_manager',
  isAdmin: false,
  scope: 'UNITS',
  managedOrgUnitIds: ['unit_sales_us', 'unit_sales_emea'],
  directReportIds: ['u_rep1', 'u_rep2', 'u_rep3'],
  memberOrgUnitIds: ['unit_sales_global'],
  allowedCategoryIds: null,
};

const EMPLOYEE: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_employee',
  isAdmin: false,
  scope: 'UNITS',
  managedOrgUnitIds: [],
  directReportIds: [],
  memberOrgUnitIds: ['unit_sales_us'],
  allowedCategoryIds: null,
};

const VIEWER: KpiVisibilityContext = {
  organizationId: ORG,
  userId: 'u_viewer',
  isAdmin: false,
  scope: 'UNITS',
  managedOrgUnitIds: [],
  directReportIds: [],
  memberOrgUnitIds: ['unit_sales_us'],
  allowedCategoryIds: null,
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
        scope: 'UNITS',
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
        scope: 'UNITS',
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

describe('kpiContextFromProfile — AccessProfile → visibility bridge (parity)', () => {
  function profileFor(ctx: KpiVisibilityContext): AccessProfile {
    return {
      isAdmin: ctx.isAdmin,
      capabilities: [],
      scopeByDomain: { KPIS: ctx.scope },
      dataTypeFilters: {
        kpiCategoryIds: ctx.allowedCategoryIds ? [...ctx.allowedCategoryIds] : null,
        orgUnitIds: null,
        dashboardIds: null,
      },
      dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
      context: {
        managedOrgUnitIds: [...ctx.managedOrgUnitIds],
        memberOrgUnitIds: [...ctx.memberOrgUnitIds],
        directReportIds: [...ctx.directReportIds],
      },
    };
  }

  // The bridge + builder must reproduce the legacy `where` for every default role.
  for (const ctx of [ADMIN, MANAGER, EMPLOYEE, VIEWER]) {
    test(`reproduces the legacy where for ${ctx.userId}`, () => {
      const bridged = kpiContextFromProfile(ctx.organizationId, ctx.userId, profileFor(ctx));
      expect(bridged).toEqual(ctx);
      expect(buildKpiVisibilityWhere(bridged)).toEqual(buildKpiVisibilityWhere(ctx));
    });
  }
});

describe('buildKpiVisibilityWhere — scope ladder enforcement (Phase 2)', () => {
  // A configurable manager: managed unit + a member unit + reports.
  const base = {
    organizationId: ORG,
    userId: 'u_mgr',
    isAdmin: false,
    managedOrgUnitIds: ['unit_a'],
    memberOrgUnitIds: ['unit_b'],
    directReportIds: ['u_r1', 'u_r2'],
  } as const;

  test('ORG ⇒ whole tenant, no scope branches', () => {
    const where = buildKpiVisibilityWhere({ ...base, scope: 'ORG' });
    expect(where.OR).toBeUndefined();
    expect(where.organizationId).toBe(ORG);
  });

  test('UNITS ⇒ units (managed∪member) + self∪reports (= legacy)', () => {
    const where = buildKpiVisibilityWhere({ ...base, scope: 'UNITS' });
    expect(getPerUnitBranch(where.OR)?.orgUnitAssignments.some.orgUnitId.in).toEqual([
      'unit_a',
      'unit_b',
    ]);
    expect(getPerUserBranch(where.OR)?.userAssignments.some.userId.in).toEqual([
      'u_mgr',
      'u_r1',
      'u_r2',
    ]);
  });

  test('DIRECT_REPORTS ⇒ no PER_UNIT branch, still sees self∪reports', () => {
    const where = buildKpiVisibilityWhere({ ...base, scope: 'DIRECT_REPORTS' });
    expect(getPerUnitBranch(where.OR)).toBeUndefined();
    expect(getOrgWideBranch(where.OR)).toBeDefined();
    expect(getPerUserBranch(where.OR)?.userAssignments.some.userId.in).toEqual([
      'u_mgr',
      'u_r1',
      'u_r2',
    ]);
  });

  test('SELF ⇒ no PER_UNIT branch, PER_USER is self only', () => {
    const where = buildKpiVisibilityWhere({ ...base, scope: 'SELF' });
    expect(getPerUnitBranch(where.OR)).toBeUndefined();
    expect(getOrgWideBranch(where.OR)).toBeDefined();
    expect(getPerUserBranch(where.OR)?.userAssignments.some.userId.in).toEqual(['u_mgr']);
  });

  test('narrowing is monotonic — each step sees a subset of the previous', () => {
    const userIdsAt = (s: 'UNITS' | 'DIRECT_REPORTS' | 'SELF') =>
      new Set(getPerUserBranch(buildKpiVisibilityWhere({ ...base, scope: s }).OR)
        ?.userAssignments.some.userId.in ?? []);
    const units = userIdsAt('UNITS');
    const reports = userIdsAt('DIRECT_REPORTS');
    const self = userIdsAt('SELF');
    expect([...self].every((u) => reports.has(u))).toBe(true);
    expect([...reports].every((u) => units.has(u))).toBe(true);
    expect(self.size).toBeLessThanOrEqual(reports.size);
  });
});

describe('buildKpiVisibilityWhere — category allowlist (Phase 3, Layer 3)', () => {
  const mgr: KpiVisibilityContext = {
    organizationId: ORG,
    userId: 'u_mgr',
    isAdmin: false,
    scope: 'UNITS',
    managedOrgUnitIds: ['unit_a'],
    memberOrgUnitIds: [],
    directReportIds: ['u_r1'],
    allowedCategoryIds: null,
  };

  test('null allowlist ⇒ no categoryId constraint (parity)', () => {
    const where = buildKpiVisibilityWhere(mgr);
    expect(where.categoryId).toBeUndefined();
    expect(getPerUnitBranch(where.OR)).toBeDefined(); // scope branches untouched
  });

  test('set allowlist ⇒ categoryId AND-filter alongside the scope branches', () => {
    const where = buildKpiVisibilityWhere({ ...mgr, allowedCategoryIds: ['cat_sales', 'cat_ops'] });
    expect(where.categoryId).toEqual({ in: ['cat_sales', 'cat_ops'] });
    // scope branches still present (category is orthogonal AND, not a replacement)
    expect(getOrgWideBranch(where.OR)).toBeDefined();
    expect(getPerUnitBranch(where.OR)).toBeDefined();
  });

  test('empty allowlist ⇒ categoryId { in: [] } (sees nothing of that type)', () => {
    const where = buildKpiVisibilityWhere({ ...mgr, allowedCategoryIds: [] });
    expect(where.categoryId).toEqual({ in: [] });
  });

  test('ORG-scope non-admin still gets the category filter, no scope branches', () => {
    const where = buildKpiVisibilityWhere({ ...mgr, scope: 'ORG', allowedCategoryIds: ['cat_sales'] });
    expect(where.categoryId).toEqual({ in: ['cat_sales'] });
    expect(where.OR).toBeUndefined();
  });

  test('admin bypasses the category allowlist entirely', () => {
    const where = buildKpiVisibilityWhere({ ...mgr, isAdmin: true, allowedCategoryIds: ['cat_sales'] });
    expect(where.categoryId).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });
});
