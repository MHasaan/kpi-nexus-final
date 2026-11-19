/**
 * Granular-access Phase 3 — category-allowlist leak closure for UserKpisService.
 *
 * Pure unit. Prisma is an in-memory fake; AuditService is a no-op spy;
 * AccessContextService is a fake whose `kpiCategoryAllowlist()` drives the
 * Layer-3 filter. Covers the LOW leak: `rowsForUser` (listMyKpis / listForUser /
 * listTeam) previously returned every PER_USER assignment's kpi.name +
 * currentValue regardless of the principal's category allowlist, so a
 * restricted-category KPI leaked even to its own owner.
 *
 *   - restricted-category PER_USER KPI is hidden from my-kpis (leak closed)
 *   - null allowlist ⇒ all rows returned (parity, admins unaffected)
 *   - empty allowlist ⇒ nothing visible
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { UserKpisService } from './user-kpis.service.js';

interface FakeAssignment {
  id: string;
  organizationId: string;
  userId: string;
  kpiId: string;
  targetValue: number | null;
  currentValue: number | null;
  status: string | null;
  createdAt: Date;
  kpi: { name: string; unit: string | null; categoryId: string | null; targetValue?: number | null; direction?: string };
}

class FakePrisma {
  assignments: FakeAssignment[] = [];

  kPIAssignmentUser = {
    findMany: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { organizationId: string; userId: string };
        select: { kpi: { select: Record<string, boolean> } };
      }) => {
        const wantCategory = Boolean(select.kpi.select.categoryId);
        return this.assignments
          .filter(
            (a) => a.organizationId === where.organizationId && a.userId === where.userId,
          )
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((a) => ({
            id: a.id,
            kpiId: a.kpiId,
            targetValue: a.targetValue,
            currentValue: a.currentValue,
            status: a.status,
            kpi: {
              name: a.kpi.name,
              unit: a.kpi.unit,
              targetValue: a.kpi.targetValue ?? null,
              direction: a.kpi.direction ?? 'HIGHER_IS_BETTER',
              // Mirror Prisma: only return the column the service actually selects.
              ...(wantCategory ? { categoryId: a.kpi.categoryId } : {}),
            },
          }));
      },
    ),
  };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

class FakeAccessContext {
  /** `null` ⇒ all categories / admin; `[ids]` ⇒ only those; `[]` ⇒ none. */
  allowlist: readonly string[] | null = null;
  kpiCategoryAllowlist = vi.fn(async () => this.allowlist);
  /** PEOPLE scope (BE-004): null ⇒ everyone visible. */
  people: string[] | null = null;
  isPersonVisible = vi.fn(async (id: string) => this.people === null || this.people.includes(id));
}

const ORG = 'org_alpha';
const ME = 'u_me';

function withCtx<T>(fn: () => Promise<T> | T): Promise<T> | T {
  const ctx: RequestContext = {
    userId: ME,
    organizationId: ORG,
    roleId: null,
    principalType: 'user',
  };
  return RequestContextStore.run(ctx, fn);
}

function makeService(): {
  service: UserKpisService;
  prisma: FakePrisma;
  accessContext: FakeAccessContext;
} {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const accessContext = new FakeAccessContext();
  const service = new UserKpisService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, accessContext };
}

function seedTwoKpis(prisma: FakePrisma): void {
  prisma.assignments.push(
    {
      id: 'asg_finance',
      organizationId: ORG,
      userId: ME,
      kpiId: 'kpi_finance',
      targetValue: 100,
      currentValue: 42,
      status: 'on_track',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      kpi: { name: 'Revenue', unit: 'USD', categoryId: 'cat_finance' },
    },
    {
      id: 'asg_hr',
      organizationId: ORG,
      userId: ME,
      kpiId: 'kpi_hr',
      targetValue: 5,
      currentValue: 3,
      status: 'at_risk',
      createdAt: new Date('2026-01-02T00:00:00Z'),
      kpi: { name: 'Headcount', unit: null, categoryId: 'cat_hr' },
    },
  );
}

describe('UserKpisService.listMyKpis — Layer-3 category allowlist', () => {
  test('hides a restricted-category PER_USER KPI even from its own owner (leak closed)', async () => {
    const { service, prisma, accessContext } = makeService();
    seedTwoKpis(prisma);
    // Allowlist permits only HR — the finance KPI (incl. its currentValue) must not leak.
    accessContext.allowlist = ['cat_hr'];

    const rows = await withCtx(() => service.listMyKpis());

    expect(rows.map((r) => r.kpiId)).toEqual(['kpi_hr']);
    expect(rows.some((r) => r.name === 'Revenue')).toBe(false);
    // No restricted currentValue leaks through.
    expect(rows.some((r) => r.currentValue === 42)).toBe(false);
  });

  test('null allowlist ⇒ every assignment returned (parity; admins unaffected)', async () => {
    const { service, prisma, accessContext } = makeService();
    seedTwoKpis(prisma);
    accessContext.allowlist = null;

    const rows = await withCtx(() => service.listMyKpis());

    expect(rows.map((r) => r.kpiId)).toEqual(['kpi_finance', 'kpi_hr']);
    expect(rows[0]).toMatchObject({ name: 'Revenue', currentValue: 42 });
  });

  test('empty allowlist ⇒ no KPIs visible', async () => {
    const { service, prisma, accessContext } = makeService();
    seedTwoKpis(prisma);
    accessContext.allowlist = [];

    const rows = await withCtx(() => service.listMyKpis());

    expect(rows).toEqual([]);
  });
});

describe('UserKpisService.listForUser — PEOPLE scope (BE-004)', () => {
  it('another person outside the caller PEOPLE scope is a 404', async () => {
    const { service, prisma, accessContext } = makeService();
    (prisma as unknown as { user: unknown }).user = { findFirst: vi.fn(async () => ({ id: 'u_other' })) };
    accessContext.people = [ME];
    await expect(withCtx(() => service.listForUser('u_other'))).rejects.toMatchObject({ status: 404 });
  });
});

// Flow walk (per-person KPIs): "My KPIs" showed no target and no status for a KPI whose target
// was set on the KPI and not on the person.
describe('UserKpisService.listMyKpis — the target a person is measured against', () => {
  test('with no target of their own, a person gets the KPI\'s target and a status worked out from it', async () => {
    const { service, prisma } = makeService();
    prisma.assignments.push(
      {
        id: 'asg_calls',
        organizationId: ORG,
        userId: ME,
        kpiId: 'kpi_calls',
        targetValue: null,
        currentValue: 45,
        status: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        kpi: { name: 'Calls made', unit: null, categoryId: null, targetValue: 40, direction: 'HIGHER_IS_BETTER' },
      },
      {
        id: 'asg_demos',
        organizationId: ORG,
        userId: ME,
        kpiId: 'kpi_demos',
        targetValue: 10,
        currentValue: 5,
        status: 'exceeded', // stale: what is stored is not what is shown
        createdAt: new Date('2026-01-02T00:00:00Z'),
        kpi: { name: 'Demos', unit: null, categoryId: null, targetValue: 4, direction: 'HIGHER_IS_BETTER' },
      },
    );
    const rows = await withCtx(() => service.listMyKpis());
    expect(rows.map((r) => [r.name, r.targetValue, r.status])).toEqual([
      ['Calls made', 40, 'exceeded'],
      // Her own target of 10 wins over the KPI's 4: half way there is behind.
      ['Demos', 10, 'behind'],
    ]);
  });
});
