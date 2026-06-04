/**
 * P3.2 — DashboardsService unit tests.
 *
 * Pure unit. Prisma is replaced with an in-memory fake; AuditService is a
 * no-op spy. Coverage targets the bits that have the most subtle
 * correctness implications:
 *
 *   - visibility filter (owner OR isShared) for non-admins
 *   - admin sees all
 *   - 412 on If-Match version mismatch
 *   - 404 for cross-tenant lookups
 *   - setDefault clears any previous default for the same user
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException, PreconditionFailedException } from '@nestjs/common';

import type { ResourceGrant } from '@kpi-nexus/contracts';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { DashboardsService, buildDashboardEtag, parseIfMatch } from './dashboards.service.js';

interface FakeDashboard {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  ownerRoleId: string | null;
  isShared: boolean;
  isDefault: boolean;
  layout: unknown;
  version: number;
  deletedAt: Date | null;
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdById: string | null;
  unitAssignmentOrgUnitIds?: string[];
}

class FakePrisma {
  private nextId = 1;
  store: FakeDashboard[] = [];

  dashboard = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return this.store
        .filter((d) => this.matches(d, where))
        .map((d) => this.materialize(d));
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const d = this.store.find((d) => this.matches(d, where));
      return d ? this.materialize(d) : null;
    }),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const d = this.store.find((row) => row.id === where.id);
      if (!d) throw new Error(`Record not found: ${where.id}`);
      return this.materialize(d);
    }),
    create: vi.fn(async ({ data }: { data: Partial<FakeDashboard> }) => {
      const created: FakeDashboard = {
        id: `dash_${this.nextId++}`,
        organizationId: data.organizationId!,
        name: data.name!,
        description: data.description ?? null,
        ownerUserId: data.ownerUserId ?? null,
        ownerRoleId: data.ownerRoleId ?? null,
        isShared: data.isShared ?? false,
        isDefault: data.isDefault ?? false,
        layout: data.layout ?? null,
        version: 1,
        deletedAt: null,
        deletedById: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: data.createdById ?? null,
      };
      this.store.push(created);
      return this.materialize(created);
    }),
    update: vi.fn(
      async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const idx = this.store.findIndex((d) => d.id === where.id);
        if (idx === -1) throw new Error('Not found');
        const cur = this.store[idx]!;
        if (data.version && typeof data.version === 'object' && 'increment' in (data.version as Record<string, unknown>)) {
          cur.version += (data.version as { increment: number }).increment;
        }
        for (const k of Object.keys(data)) {
          if (k === 'version') continue;
          (cur as unknown as Record<string, unknown>)[k] = data[k];
        }
        cur.updatedAt = new Date();
        return this.materialize(cur);
      },
    ),
    updateMany: vi.fn(
      async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const d of this.store) {
          if (this.matches(d, where)) {
            for (const k of Object.keys(data)) {
              (d as unknown as Record<string, unknown>)[k] = data[k];
            }
            count++;
          }
        }
        return { count };
      },
    ),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const idx = this.store.findIndex((d) => d.id === where.id);
      if (idx === -1) throw new Error(`Record not found for delete: ${where.id}`);
      const removed = this.store[idx]!;
      this.store.splice(idx, 1);
      return this.materialize(removed);
    }),
  };

  $transaction = vi.fn(async (fn: (tx: FakePrisma) => Promise<unknown>) => {
    return fn(this);
  });

  orgUnits: Array<{ id: string; organizationId: string }> = [];
  unitAssignmentRows: Array<{ dashboardId: string; orgUnitId: string; createdAt: Date }> = [];

  orgUnit = {
    findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
      this.orgUnits.find((u) => u.id === where.id && u.organizationId === where.organizationId) ?? null,
    ),
  };

  dashboardAssignmentOrgUnit = {
    findMany: vi.fn(async ({ where }: { where: { dashboardId: string } }) =>
      this.unitAssignmentRows
        .filter((a) => a.dashboardId === where.dashboardId)
        .map((a) => ({ orgUnitId: a.orgUnitId, createdAt: a.createdAt })),
    ),
    upsert: vi.fn(async ({ create }: { create: { dashboardId: string; orgUnitId: string } }) => {
      const exists = this.unitAssignmentRows.some(
        (a) => a.dashboardId === create.dashboardId && a.orgUnitId === create.orgUnitId,
      );
      if (!exists) {
        this.unitAssignmentRows.push({
          dashboardId: create.dashboardId,
          orgUnitId: create.orgUnitId,
          createdAt: new Date(),
        });
      }
      return {};
    }),
    deleteMany: vi.fn(async ({ where }: { where: { dashboardId: string; orgUnitId: string } }) => {
      const before = this.unitAssignmentRows.length;
      this.unitAssignmentRows = this.unitAssignmentRows.filter(
        (a) => !(a.dashboardId === where.dashboardId && a.orgUnitId === where.orgUnitId),
      );
      return { count: before - this.unitAssignmentRows.length };
    }),
  };

  private matches(d: FakeDashboard, where: Record<string, unknown>): boolean {
    if (where.id) {
      const cond = where.id;
      if (typeof cond === 'object' && cond !== null && 'in' in (cond as Record<string, unknown>)) {
        if (!(cond as { in: string[] }).in.includes(d.id)) return false;
      } else if (d.id !== cond) {
        return false;
      }
    }
    if (where.organizationId && d.organizationId !== where.organizationId) return false;
    if ('deletedAt' in where) {
      const cond = where.deletedAt;
      if (cond === null && d.deletedAt !== null) return false;
      // Handle { not: null } — match only rows where deletedAt IS set
      if (
        cond !== null &&
        typeof cond === 'object' &&
        'not' in (cond as Record<string, unknown>) &&
        (cond as Record<string, unknown>).not === null &&
        d.deletedAt === null
      ) return false;
    }
    if (where.ownerUserId) {
      const cond = where.ownerUserId;
      if (typeof cond === 'object' && cond !== null && 'in' in (cond as Record<string, unknown>)) {
        if (d.ownerUserId == null || !(cond as { in: string[] }).in.includes(d.ownerUserId)) {
          return false;
        }
      } else if (d.ownerUserId !== cond) {
        return false;
      }
    }
    if (where.unitAssignments) {
      const some = (where.unitAssignments as { some?: { orgUnitId?: { in?: string[] } } }).some;
      const inIds = some?.orgUnitId?.in ?? [];
      const assigned = d.unitAssignmentOrgUnitIds ?? [];
      if (!assigned.some((u) => inIds.includes(u))) return false;
    }
    if (typeof where.isShared === 'boolean' && d.isShared !== where.isShared) return false;
    if (typeof where.isDefault === 'boolean' && d.isDefault !== where.isDefault) return false;
    if (Array.isArray(where.OR)) {
      const matchesAny = (where.OR as Array<Record<string, unknown>>).some((branch) =>
        this.matches(d, branch),
      );
      if (!matchesAny) return false;
    }
    return true;
  }

  private materialize(d: FakeDashboard): FakeDashboard & { widgets: never[] } {
    return { ...d, widgets: [] };
  }
}

class FakeAudit {
  records: Array<Record<string, unknown>> = [];
  record = vi.fn(async (input: Record<string, unknown>) => {
    this.records.push(input);
  });
}

class FakeAccessContext {
  isAdmin = false;
  dashboardsScope: 'SELF' | 'DIRECT_REPORTS' | 'UNITS' | 'ORG' = 'SELF';
  directReportIds: string[] = [];
  managedOrgUnitIds: string[] = [];
  memberOrgUnitIds: string[] = [];
  unitMemberIds: string[] = [];
  resourceGrants: ResourceGrant[] = [];
  resolveForCurrentPrincipal = vi.fn(async () => ({
    isAdmin: this.isAdmin,
    capabilities: [],
    scopeByDomain: { DASHBOARDS: this.dashboardsScope },
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
    dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
    context: {
      managedOrgUnitIds: this.managedOrgUnitIds,
      memberOrgUnitIds: this.memberOrgUnitIds,
      directReportIds: this.directReportIds,
    },
    resourceGrants: this.resourceGrants,
  }));
  unitMemberUserIds = vi.fn(async () => this.unitMemberIds);
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  const fullCtx: RequestContext = {
    userId: ctx.userId ?? 'u1',
    organizationId: ctx.organizationId ?? ORG,
    roleId: ctx.roleId ?? null,
    principalType: ctx.principalType ?? 'user',
  };
  return RequestContextStore.run(fullCtx, fn);
}

function makeService(): {
  service: DashboardsService;
  prisma: FakePrisma;
  audit: FakeAudit;
  accessContext: FakeAccessContext;
} {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const accessContext = new FakeAccessContext();
  const service = new DashboardsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, audit, accessContext };
}

describe('parseIfMatch', () => {
  test('parses weak ETag', () => {
    expect(parseIfMatch('W/"3"')).toBe(3);
  });
  test('parses strong ETag', () => {
    expect(parseIfMatch('"7"')).toBe(7);
  });
  test('returns null for missing header', () => {
    expect(parseIfMatch(undefined)).toBeNull();
  });
  test('returns null for unparseable input', () => {
    expect(parseIfMatch('garbage')).toBeNull();
  });
});

describe('buildDashboardEtag', () => {
  test('builds weak ETag from version', () => {
    expect(buildDashboardEtag(5)).toBe('W/"5"');
  });
});

describe('DashboardsService.list', () => {
  test('admin sees all non-deleted dashboards in the org', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'someone_else' }),
      makeRow({ id: 'd2', ownerUserId: 'u1' }),
      makeRow({ id: 'd3', ownerUserId: 'other', isShared: false }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  });

  test('non-admin at default (SELF) scope sees own + shared dashboards (parity)', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', isShared: false }),
      makeRow({ id: 'd2', ownerUserId: 'someone_else', isShared: true }),
      makeRow({ id: 'd3', ownerUserId: 'someone_else', isShared: false }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  test('SELF scope still includes shared (isShared floor)', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.dashboardsScope = 'SELF';
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', isShared: false }),
      makeRow({ id: 'd2', ownerUserId: 'someone_else', isShared: true }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  test('UNITS scope ⇒ OR adds unit-owner set and unit-assigned dashboards', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.dashboardsScope = 'UNITS';
    accessContext.unitMemberIds = ['peer1'];
    accessContext.managedOrgUnitIds = ['g1'];
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.dashboard.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { ownerUserId: { in: expect.arrayContaining(['me', 'peer1']) } },
        { isShared: true },
        { unitAssignments: { some: { orgUnitId: { in: ['g1'] } } } },
      ]),
    );
  });

  test('ORG scope ⇒ no OR filter (all dashboards in tenant)', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.dashboardsScope = 'ORG';
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.dashboard.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.OR).toBeUndefined();
  });

  test('default (SELF) scope ⇒ OR is own ∪ shared (parity)', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.dashboard.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ ownerUserId: { in: ['me'] } }, { isShared: true }]),
    );
  });

  test('does not leak deleted rows', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    const result = await withCtx({ userId: 'u1' }, () => service.list());
    expect(result).toEqual([]);
  });
});

describe('DashboardsService.getById', () => {
  test('owner can read', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1' }));
    const result = await withCtx({ userId: 'u1' }, () => service.getById('d1'));
    expect(result.id).toBe('d1');
  });

  test('non-owner non-shared returns 404 (no existence leak)', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: false }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.getById('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('isShared dashboard is visible to non-owner', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: true }));
    const result = await withCtx({ userId: 'u1' }, () => service.getById('d1'));
    expect(result.id).toBe('d1');
  });

  test('cross-tenant lookup returns 404', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', organizationId: 'other_org', ownerUserId: 'u1' }));
    await expect(
      withCtx({ userId: 'u1', organizationId: ORG }, () => service.getById('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('a ResourcePermission view-grant surfaces an out-of-scope dashboard in list()/getById() (Phase 3.5)', async () => {
    const { service, prisma, accessContext } = makeService();
    // non-admin at default SELF scope; dX owned by someone else, not shared ⇒ normally invisible.
    accessContext.resourceGrants = [
      { resourceType: 'dashboard', resourceId: 'dX', action: 'view' },
    ];
    prisma.store.push(makeRow({ id: 'dX', ownerUserId: 'someone_else', isShared: false }));

    const listed = await withCtx({ userId: 'u1' }, () => service.list());
    expect(listed.map((d) => d.id)).toContain('dX');

    const fetched = await withCtx({ userId: 'u1' }, () => service.getById('dX'));
    expect(fetched.id).toBe('dX');
  });

  test('WITHOUT a grant the same out-of-scope dashboard 404s (Phase 3.5 control)', async () => {
    const { service, prisma } = makeService();
    // no resourceGrants; default SELF scope; not own, not shared ⇒ invisible.
    prisma.store.push(makeRow({ id: 'dX', ownerUserId: 'someone_else', isShared: false }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.getById('dX')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DashboardsService.update — optimistic concurrency', () => {
  test('matching If-Match version succeeds, bumps version', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', name: 'Old' }));
    const result = await withCtx({ userId: 'u1' }, () =>
      service.update('d1', { name: 'New' }, 1),
    );
    expect(result.name).toBe('New');
    expect(result.version).toBe(2);
  });

  test('mismatched If-Match version throws 412 with current ETag', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', version: 5 }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.update('d1', { name: 'X' }, 3)),
    ).rejects.toMatchObject({
      response: {
        code: 'PRECONDITION_FAILED',
        details: { currentVersion: 5, currentEtag: 'W/"5"' },
      },
    });
  });

  test('null If-Match (header absent) skips the check', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', version: 7 }));
    const result = await withCtx({ userId: 'u1' }, () =>
      service.update('d1', { name: 'Skip' }, null),
    );
    expect(result.version).toBe(8);
  });

  test('returns 412 — instanceof PreconditionFailedException', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', version: 2 }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.update('d1', { name: 'X' }, 1)),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });
});

describe('DashboardsService.setDefault', () => {
  test('clears previous default for the same user and sets the new one', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', isDefault: true }),
      makeRow({ id: 'd2', ownerUserId: 'u1', isDefault: false }),
    );
    await withCtx({ userId: 'u1' }, () => service.setDefault('d2'));
    expect(prisma.store.find((d) => d.id === 'd1')!.isDefault).toBe(false);
    expect(prisma.store.find((d) => d.id === 'd2')!.isDefault).toBe(true);
  });

  test("does not touch another user's default flag", async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u2', isDefault: true }),
      makeRow({ id: 'd2', ownerUserId: 'u1', isDefault: false, isShared: true }),
    );
    await withCtx({ userId: 'u1' }, () => service.setDefault('d2'));
    expect(prisma.store.find((d) => d.id === 'd1')!.isDefault).toBe(true);
  });
});

describe('DashboardsService.create', () => {
  test('records audit and stores ownerUserId from context', async () => {
    const { service, prisma, audit } = makeService();
    const created = await withCtx({ userId: 'u1' }, () =>
      service.create({ name: 'My dash', isShared: false, tags: [] } as unknown as Parameters<
        DashboardsService['create']
      >[0]),
    );
    expect(prisma.store).toHaveLength(1);
    expect(created.ownerUserId).toBe('u1');
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({ action: 'CREATE', entityType: 'Dashboard' });
  });
});

describe('DashboardsService.remove', () => {
  test('soft deletes by setting deletedAt', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1' }));
    await withCtx({ userId: 'u1' }, () => service.remove('d1'));
    expect(prisma.store[0]!.deletedAt).not.toBeNull();
    expect(prisma.store[0]!.deletedById).toBe('u1');
  });
});

// ---------------------------------------------------------------------------
// archive / restore / purge
// ---------------------------------------------------------------------------

describe('DashboardsService.listArchived', () => {
  test('returns only soft-deleted dashboards in tenant', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }),
      makeRow({ id: 'd2', ownerUserId: 'u1', deletedAt: null }),
      makeRow({ id: 'd3', ownerUserId: 'other', deletedAt: new Date() }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.listArchived());
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd3']);
  });

  test('non-admin sees only own or shared archived dashboards', async () => {
    const { service, prisma } = makeService();
    // accessContext.isAdmin stays false ⇒ default SELF scope ⇒ own ∪ shared
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date(), isShared: false }),
      makeRow({ id: 'd2', ownerUserId: 'other', deletedAt: new Date(), isShared: true }),
      makeRow({ id: 'd3', ownerUserId: 'other', deletedAt: new Date(), isShared: false }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.listArchived());
    // d1 (own), d2 (shared) — d3 invisible
    expect(result.map((d) => d.id).sort()).toEqual(['d1', 'd2']);
  });

  test('excludes dashboards from another tenant', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(
      makeRow({ id: 'd1', organizationId: 'other_org', ownerUserId: 'u1', deletedAt: new Date() }),
      makeRow({ id: 'd2', ownerUserId: 'u1', deletedAt: new Date() }),
    );
    const result = await withCtx({ userId: 'u1', organizationId: ORG }, () =>
      service.listArchived(),
    );
    // d1 belongs to another tenant — must NOT appear
    expect(result.map((d) => d.id)).toEqual(['d2']);
  });

  test('non-deleted dashboards are excluded', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: null }));
    const result = await withCtx({ userId: 'u1' }, () => service.listArchived());
    expect(result).toEqual([]);
  });
});

describe('DashboardsService.restore', () => {
  test('clears deletedAt on an archived dashboard', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    await withCtx({ userId: 'u1' }, () => service.restore('d1'));
    expect(prisma.store[0]!.deletedAt).toBeNull();
  });

  test('restore returns the restored dashboard', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    const result = await withCtx({ userId: 'u1' }, () => service.restore('d1'));
    expect(result.id).toBe('d1');
    expect(result.deletedAt).toBeNull();
  });

  test('restore on a non-archived dashboard throws 404', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: null }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.restore('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('restore on a cross-tenant id throws 404 (no side-effect)', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', organizationId: 'other_org', ownerUserId: 'u1', deletedAt: new Date() }),
    );
    await expect(
      withCtx({ userId: 'u1', organizationId: ORG }, () => service.restore('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Confirm the row was NOT mutated
    expect(prisma.store[0]!.deletedAt).not.toBeNull();
  });

  test('restore records an audit entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    await withCtx({ userId: 'u1' }, () => service.restore('d1'));
    expect(audit.records.some((r) => r['action'] === 'UPDATE' && r['entityId'] === 'd1')).toBe(true);
  });

  test('restore on an archived dashboard owned by someone else (not shared) throws 404 at SELF scope', async () => {
    const { service, prisma } = makeService();
    // non-admin default SELF scope; archived row owned by another, not shared ⇒ out of scope
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: false, deletedAt: new Date() }),
    );
    await expect(
      withCtx({ userId: 'u1' }, () => service.restore('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Row must NOT be mutated
    expect(prisma.store[0]!.deletedAt).not.toBeNull();
  });

  test('admin can restore any archived dashboard regardless of owner', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: false, deletedAt: new Date() }),
    );
    const result = await withCtx({ userId: 'u1' }, () => service.restore('d1'));
    expect(result.id).toBe('d1');
    expect(prisma.store[0]!.deletedAt).toBeNull();
  });
});

describe('DashboardsService.purge', () => {
  test('hard-deletes an archived dashboard', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    await withCtx({ userId: 'u1' }, () => service.purge('d1'));
    expect(prisma.store.find((d) => d.id === 'd1')).toBeUndefined();
  });

  test('purge on non-archived dashboard throws 404', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: null }));
    await expect(
      withCtx({ userId: 'u1' }, () => service.purge('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Row must still exist
    expect(prisma.store).toHaveLength(1);
  });

  test('purge on cross-tenant id throws 404 (no side-effect)', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', organizationId: 'other_org', ownerUserId: 'u1', deletedAt: new Date() }),
    );
    await expect(
      withCtx({ userId: 'u1', organizationId: ORG }, () => service.purge('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.store).toHaveLength(1);
  });

  test('purge records an audit DELETE entry', async () => {
    const { service, prisma, audit } = makeService();
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'u1', deletedAt: new Date() }));
    await withCtx({ userId: 'u1' }, () => service.purge('d1'));
    expect(
      audit.records.some((r) => r['action'] === 'DELETE' && r['entityId'] === 'd1'),
    ).toBe(true);
  });

  test('purge on an archived dashboard owned by someone else (not shared) throws 404 at SELF scope', async () => {
    const { service, prisma } = makeService();
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: false, deletedAt: new Date() }),
    );
    await expect(
      withCtx({ userId: 'u1' }, () => service.purge('d1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    // Row must still exist (no side-effect)
    expect(prisma.store).toHaveLength(1);
  });

  test('admin can purge any archived dashboard regardless of owner', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(
      makeRow({ id: 'd1', ownerUserId: 'someone_else', isShared: false, deletedAt: new Date() }),
    );
    await withCtx({ userId: 'u1' }, () => service.purge('d1'));
    expect(prisma.store.find((d) => d.id === 'd1')).toBeUndefined();
  });
});

describe('DashboardsService unit assignments (Phase 2.5)', () => {
  test('assign validates the org unit, upserts idempotently, and audits', async () => {
    const { service, prisma, audit, accessContext } = makeService();
    accessContext.isAdmin = true; // can see any dashboard
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'someone' }));
    prisma.orgUnits.push({ id: 'g1', organizationId: ORG });
    await withCtx({ userId: 'me' }, () => service.assignUnit('d1', 'g1'));
    await withCtx({ userId: 'me' }, () => service.assignUnit('d1', 'g1')); // idempotent
    expect(prisma.dashboardAssignmentOrgUnit.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.unitAssignmentRows).toHaveLength(1); // no duplicate
    expect(
      audit.records.some((r) => r['entityType'] === 'Dashboard' && r['entityId'] === 'd1'),
    ).toBe(true);
  });

  test('assign rejects an org unit outside the tenant ⇒ 404', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'me' }));
    // no matching orgUnit pushed ⇒ findFirst returns null
    await expect(
      withCtx({ userId: 'me' }, () => service.assignUnit('d1', 'gX')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dashboardAssignmentOrgUnit.upsert).not.toHaveBeenCalled();
  });

  test('assign on a dashboard the caller cannot see ⇒ 404 (no unit lookup)', async () => {
    const { service, prisma } = makeService();
    // non-admin (default SELF), dashboard owned by someone else, not shared ⇒ getById 404s
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'other', isShared: false }));
    prisma.orgUnits.push({ id: 'g1', organizationId: ORG });
    await expect(
      withCtx({ userId: 'me' }, () => service.assignUnit('d1', 'g1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.orgUnit.findFirst).not.toHaveBeenCalled();
  });

  test('listUnitAssignments returns the published units (after a visibility gate)', async () => {
    const { service, prisma, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'me' }));
    prisma.unitAssignmentRows.push(
      { dashboardId: 'd1', orgUnitId: 'g1', createdAt: new Date() },
      { dashboardId: 'd2', orgUnitId: 'g9', createdAt: new Date() }, // other dashboard, excluded
    );
    const result = await withCtx({ userId: 'me' }, () => service.listUnitAssignments('d1'));
    expect(result.map((r) => r.orgUnitId)).toEqual(['g1']);
  });

  test('unassign removes the row and audits', async () => {
    const { service, prisma, audit, accessContext } = makeService();
    accessContext.isAdmin = true;
    prisma.store.push(makeRow({ id: 'd1', ownerUserId: 'me' }));
    prisma.unitAssignmentRows.push({ dashboardId: 'd1', orgUnitId: 'g1', createdAt: new Date() });
    await withCtx({ userId: 'me' }, () => service.unassignUnit('d1', 'g1'));
    expect(prisma.unitAssignmentRows).toHaveLength(0);
    expect(
      audit.records.some(
        (r) =>
          r['metadata'] &&
          (r['metadata'] as Record<string, unknown>)['unassignedUnit'] === 'g1',
      ),
    ).toBe(true);
  });
});

function makeRow(over: Partial<FakeDashboard> = {}): FakeDashboard {
  return {
    id: 'd_x',
    organizationId: ORG,
    name: 'Dash',
    description: null,
    ownerUserId: 'u1',
    ownerRoleId: null,
    isShared: false,
    isDefault: false,
    layout: null,
    version: 1,
    deletedAt: null,
    deletedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 'u1',
    ...over,
  };
}
