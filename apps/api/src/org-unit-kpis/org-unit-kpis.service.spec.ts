/**
 * OrgUnitKpisService.list() — Layer-3 KPI category allowlist (Phase 3 security fix).
 *
 * Pure unit. Prisma is replaced with an in-memory fake; AuditService is a no-op;
 * AccessContextService is a fake whose `kpiCategoryAllowlist()` returns the
 * configured allowlist. Coverage targets the leak this fix closes:
 *
 *   - a role restricted to category A does NOT see a category-B PER_UNIT assignment
 *   - a null-category assignment is hidden once an allowlist is set
 *   - null allowlist ⇒ all rows (parity / unconfigured roles)
 *   - admin ⇒ all rows (allowlist resolves to null for admins)
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { OrgUnitKpisService } from './org-unit-kpis.service.js';

const ORG = 'org_alpha';
const UNIT = 'unit_1';

interface FakeAssignment {
  id: string;
  kpiId: string;
  orgUnitId: string;
  organizationId: string;
  inherited: boolean;
  inheritedFromUnitId: string | null;
  targetValue: number | null;
  currentValue: number | null;
  status: string | null;
  kpi: { name: string; unit: string | null; categoryId: string | null };
}

class FakePrisma {
  assignments: FakeAssignment[] = [];

  orgUnit = {
    // Used by requireUnit(); the unit always exists in this org for these tests.
    findFirst: vi.fn(async () => ({ id: UNIT })),
  };

  kPIAssignmentOrgUnit = {
    findMany: vi.fn(async ({ where }: {
      where: { orgUnitId: string; organizationId: string };
      select?: { kpi?: { select?: { categoryId?: boolean } } };
    }) =>
      this.assignments.filter(
        (a) => a.orgUnitId === where.orgUnitId && a.organizationId === where.organizationId,
      ),
    ),
  };
}

class FakeAudit {
  record = vi.fn(async () => undefined);
}

class FakeAccessContext {
  allowlist: readonly string[] | null = null;
  kpiCategoryAllowlist = vi.fn(async () => this.allowlist);
  /** ORG scope (BE-004): null ⇒ every unit visible. */
  units: string[] | null = null;
  isOrgUnitVisible = vi.fn(async (id: string) => this.units === null || this.units.includes(id));
}

function makeAssignment(over: Partial<FakeAssignment> & { id: string }): FakeAssignment {
  return {
    kpiId: `kpi_${over.id}`,
    orgUnitId: UNIT,
    organizationId: ORG,
    inherited: false,
    inheritedFromUnitId: null,
    targetValue: null,
    currentValue: 42,
    status: 'ON_TRACK',
    kpi: { name: `KPI ${over.id}`, unit: '%', categoryId: null },
    ...over,
  };
}

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const ctx: RequestContext = {
    userId: 'u1',
    organizationId: ORG,
    roleId: 'role_1',
    principalType: 'user',
  };
  return RequestContextStore.run(ctx, fn);
}

function makeService(): {
  service: OrgUnitKpisService;
  prisma: FakePrisma;
  accessContext: FakeAccessContext;
} {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const accessContext = new FakeAccessContext();
  // category A allowed; B/null disallowed (when an allowlist is configured).
  prisma.assignments = [
    makeAssignment({ id: 'a', kpi: { name: 'Cat A KPI', unit: '%', categoryId: 'cat_A' } }),
    makeAssignment({ id: 'b', kpi: { name: 'Cat B KPI', unit: '%', categoryId: 'cat_B' } }),
    makeAssignment({ id: 'n', kpi: { name: 'Uncategorized KPI', unit: '%', categoryId: null } }),
  ];
  const service = new OrgUnitKpisService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, accessContext };
}

describe('OrgUnitKpisService.list() category allowlist', () => {
  test('hides category-B and null-category assignments when restricted to category A', async () => {
    const { service, accessContext } = makeService();
    accessContext.allowlist = ['cat_A'];

    const rows = await withCtx(() => service.list(UNIT));

    expect(rows.map((r) => r.assignmentId)).toEqual(['a']);
    // the leak: category-B name + currentValue must not be returned.
    expect(rows.some((r) => r.name === 'Cat B KPI')).toBe(false);
    expect(rows.some((r) => r.name === 'Uncategorized KPI')).toBe(false);
  });

  test('selects the joined kpi.categoryId so the filter has data to act on', async () => {
    const { service, prisma } = makeService();

    await withCtx(() => service.list(UNIT));

    const select = prisma.kPIAssignmentOrgUnit.findMany.mock.calls[0]?.[0]?.select;
    expect(select?.kpi?.select?.categoryId).toBe(true);
  });

  test('null allowlist ⇒ all rows (parity / unconfigured role)', async () => {
    const { service, accessContext } = makeService();
    accessContext.allowlist = null;

    const rows = await withCtx(() => service.list(UNIT));

    expect(rows.map((r) => r.assignmentId)).toEqual(['a', 'b', 'n']);
  });

  test('admin ⇒ all rows (allowlist resolves to null for admins)', async () => {
    // AccessContextService.kpiCategoryAllowlist() already returns null for admins;
    // the service consumes that null and shows everything.
    const { service, accessContext } = makeService();
    accessContext.allowlist = null;

    const rows = await withCtx(() => service.list(UNIT));

    expect(rows).toHaveLength(3);
  });
});

describe('OrgUnitKpisService — ORG scope (BE-004)', () => {
  test('a unit outside the caller ORG scope is a 404 for its KPI list', async () => {
    const { service, accessContext } = makeService();
    accessContext.units = ['some_other_unit'];
    await expect(withCtx(() => service.list(UNIT))).rejects.toMatchObject({ status: 404 });
  });
});
