/**
 * ObjectivesService unit tests. In-memory fake for objective / keyResult /
 * kPIDataPoint. Covers: create/list (org-scoped), recompute from KR values,
 * parent rollup, depth-10 cycle guard (no infinite loop / throw), and
 * syncFromLinkedKpis pulling the latest KPI value into the KR.
 */
import { describe, expect, test, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Scope } from '@kpi-nexus/contracts';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { CreateObjectiveDtoSchema, UpdateObjectiveDtoSchema } from './dto/okr.dto.js';
import { ObjectivesService } from './objectives.service.js';

interface FakeObjective {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  ownerUserId: string;
  parentObjectiveId: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}
interface FakeKr {
  id: string;
  organizationId: string;
  objectiveId: string;
  name: string;
  description: string | null;
  kpiId: string | null;
  baselineValue: number | null;
  targetValue: number;
  currentValue: number | null;
  weight: number;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
}
interface FakeDp {
  organizationId: string;
  kpiId: string;
  value: number;
  recordedAt: Date;
}

class FakePrisma {
  private on = 1;
  private kn = 1;
  objectives: FakeObjective[] = [];
  krs: FakeKr[] = [];
  dps: FakeDp[] = [];

  objective = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.objectives.find((o) => o.id === where.id && o.organizationId === where.organizationId) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const ownerOk = (o: FakeObjective, cond: unknown): boolean => {
        if (cond === undefined) return true;
        if (cond && typeof cond === 'object' && 'in' in (cond as Record<string, unknown>)) {
          return (cond as { in: string[] }).in.includes(o.ownerUserId);
        }
        return o.ownerUserId === cond;
      };
      return this.objectives.filter((o) => {
        if (o.organizationId !== where.organizationId) return false;
        if (where.parentObjectiveId !== undefined && o.parentObjectiveId !== where.parentObjectiveId) return false;
        if (where.status !== undefined && o.status !== where.status) return false;
        if (!ownerOk(o, where.ownerUserId)) return false;
        if (Array.isArray(where.AND)) {
          if (!(where.AND as Array<Record<string, unknown>>).every((cl) => ownerOk(o, cl.ownerUserId))) return false;
        }
        return true;
      });
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const o: FakeObjective = {
        id: `obj_${this.on++}`,
        organizationId: data.organizationId as string,
        name: data.name as string,
        description: (data.description as string) ?? null,
        ownerUserId: data.ownerUserId as string,
        parentObjectiveId: (data.parentObjectiveId as string) ?? null,
        periodStart: data.periodStart as Date,
        periodEnd: data.periodEnd as Date,
        status: (data.status as string) ?? 'DRAFT',
        progress: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.objectives.push(o);
      return o;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const o = this.objectives.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (o as unknown as Record<string, unknown>)[k] = data[k];
      o.updatedAt = new Date();
      return o;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.objectives = this.objectives.filter((o) => o.id !== where.id);
      return {};
    }),
  };

  keyResult = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.krs.filter((k) => k.organizationId === where.organizationId && k.objectiveId === where.objectiveId),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const k = this.krs.find((x) => x.id === where.id)!;
      for (const key of Object.keys(data)) if (data[key] !== undefined) (k as unknown as Record<string, unknown>)[key] = data[key];
      k.updatedAt = new Date();
      return k;
    }),
  };

  kPIDataPoint = {
    findFirst: vi.fn(async ({ where, orderBy }: { where: Record<string, unknown>; orderBy: unknown }) => {
      void orderBy;
      const matches = this.dps
        .filter((d) => d.organizationId === where.organizationId && d.kpiId === where.kpiId)
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
      return matches[0] ?? null;
    }),
  };

  addKr(partial: Partial<FakeKr> & { objectiveId: string; targetValue: number }): FakeKr {
    const k: FakeKr = {
      id: `kr_${this.kn++}`,
      organizationId: ORG,
      objectiveId: partial.objectiveId,
      name: partial.name ?? 'KR',
      description: null,
      kpiId: partial.kpiId ?? null,
      baselineValue: partial.baselineValue ?? null,
      targetValue: partial.targetValue,
      currentValue: partial.currentValue ?? null,
      weight: partial.weight ?? 1,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.krs.push(k);
    return k;
  }
}

class FakeAudit {
  record = vi.fn(async () => {});
}

class FakeAccessContext {
  isAdmin = false;
  okrsScope: Scope = 'ORG';
  directReportIds: string[] = [];
  unitMemberIds: string[] = [];
  resolveForCurrentPrincipal = vi.fn(async () => ({
    isAdmin: this.isAdmin,
    capabilities: [],
    scopeByDomain: { OKRS: this.okrsScope },
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
    dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
    context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: this.directReportIds },
  }));
  unitMemberUserIds = vi.fn(async () => this.unitMemberIds);
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'owner', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService(
  opts: { isAdmin?: boolean; okrsScope?: Scope; directReportIds?: string[]; unitMemberIds?: string[] } = {},
) {
  const prisma = new FakePrisma();
  const accessContext = new FakeAccessContext();
  accessContext.isAdmin = opts.isAdmin ?? false;
  if (opts.okrsScope) accessContext.okrsScope = opts.okrsScope;
  if (opts.directReportIds) accessContext.directReportIds = opts.directReportIds;
  if (opts.unitMemberIds) accessContext.unitMemberIds = opts.unitMemberIds;
  const service = new ObjectivesService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, accessContext };
}

const period = { periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-12-31') };

describe('ObjectivesService CRUD', () => {
  test('create + list org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ name: 'Grow', ownerUserId: 'owner', ...period }));
    await withCtx({ organizationId: 'other' }, () => service.create({ name: 'Other', ownerUserId: 'x', ...period }));
    const rows = await withCtx({}, () => service.list({}));
    expect(rows.map((r) => r.name)).toEqual(['Grow']);
  });

  test('getById cross-tenant → 404', async () => {
    const { service } = makeService();
    const o = await withCtx({ organizationId: 'a' }, () => service.create({ name: 'X', ownerUserId: 'o', ...period }));
    await expect(withCtx({ organizationId: 'b' }, () => service.getById(o.id))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ObjectivesService.recomputeObjectiveProgress', () => {
  test('computes objective progress from KR values (weighted)', async () => {
    const { service, prisma } = makeService();
    const o = await withCtx({}, () => service.create({ name: 'O', ownerUserId: 'owner', ...period }));
    prisma.addKr({ objectiveId: o.id, baselineValue: 0, targetValue: 100, currentValue: 100, weight: 3 }); // progress 1.0
    prisma.addKr({ objectiveId: o.id, baselineValue: 0, targetValue: 100, currentValue: 0, weight: 1 }); // progress 0.0
    await withCtx({}, () => service.recomputeObjectiveProgress(o.id));
    expect(prisma.objectives.find((x) => x.id === o.id)!.progress).toBeCloseTo(0.75);
  });

  test('rolls up into the parent objective', async () => {
    const { service, prisma } = makeService();
    const parent = await withCtx({}, () => service.create({ name: 'Parent', ownerUserId: 'owner', ...period }));
    const child = await withCtx({}, () =>
      service.create({ name: 'Child', ownerUserId: 'owner', parentObjectiveId: parent.id, ...period }),
    );
    prisma.addKr({ objectiveId: child.id, baselineValue: 0, targetValue: 100, currentValue: 50, weight: 1 }); // 0.5
    await withCtx({}, () => service.recomputeObjectiveProgress(child.id));
    expect(prisma.objectives.find((x) => x.id === child.id)!.progress).toBeCloseTo(0.5);
    // parent has one child (0.5), no KRs → parent progress 0.5
    expect(prisma.objectives.find((x) => x.id === parent.id)!.progress).toBeCloseTo(0.5);
  });

  test('depth-10 cycle guard: a parent cycle does not loop forever or throw', async () => {
    const { service, prisma } = makeService();
    const a = await withCtx({}, () => service.create({ name: 'A', ownerUserId: 'owner', ...period }));
    const b = await withCtx({}, () => service.create({ name: 'B', ownerUserId: 'owner', parentObjectiveId: a.id, ...period }));
    // Introduce a cycle: A's parent = B
    prisma.objectives.find((x) => x.id === a.id)!.parentObjectiveId = b.id;
    prisma.addKr({ objectiveId: b.id, baselineValue: 0, targetValue: 100, currentValue: 100, weight: 1 });
    await expect(withCtx({}, () => service.recomputeObjectiveProgress(b.id))).resolves.not.toThrow();
  });
});

describe('ObjectivesService.syncFromLinkedKpis', () => {
  test('pulls the latest KPI data point into the linked KR and recomputes', async () => {
    const { service, prisma } = makeService();
    const o = await withCtx({}, () => service.create({ name: 'O', ownerUserId: 'owner', ...period }));
    const kr = prisma.addKr({ objectiveId: o.id, kpiId: 'kpi_9', baselineValue: 0, targetValue: 100, currentValue: null, weight: 1 });
    prisma.dps.push(
      { organizationId: ORG, kpiId: 'kpi_9', value: 40, recordedAt: new Date('2026-03-01') },
      { organizationId: ORG, kpiId: 'kpi_9', value: 70, recordedAt: new Date('2026-04-01') }, // latest
    );
    await withCtx({}, () => service.syncFromLinkedKpis(o.id));
    const updated = prisma.krs.find((k) => k.id === kr.id)!;
    expect(updated.currentValue).toBe(70);
    expect(updated.progress).toBeCloseTo(0.7);
    expect(prisma.objectives.find((x) => x.id === o.id)!.progress).toBeCloseTo(0.7);
  });

  test('KR without a linked KPI is left untouched by sync', async () => {
    const { service, prisma } = makeService();
    const o = await withCtx({}, () => service.create({ name: 'O', ownerUserId: 'owner', ...period }));
    const kr = prisma.addKr({ objectiveId: o.id, kpiId: null, baselineValue: 0, targetValue: 100, currentValue: 25, weight: 1 });
    await withCtx({}, () => service.syncFromLinkedKpis(o.id));
    expect(prisma.krs.find((k) => k.id === kr.id)!.currentValue).toBe(25);
  });
});

describe('ObjectivesService OKRS scope (Phase 2.5)', () => {
  test('default ORG ⇒ no owner filter (parity)', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'me' }, () => service.list({}));
    const where = prisma.objective.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.ownerUserId).toBeUndefined();
    expect(where.AND).toBeUndefined();
  });

  test('SELF ⇒ ownerUserId IN {me}', async () => {
    const { service, prisma } = makeService({ okrsScope: 'SELF' });
    await withCtx({ userId: 'me' }, () => service.list({}));
    const where = prisma.objective.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.ownerUserId).toEqual({ in: ['me'] });
  });

  test('explicit owner filter intersects with scope (AND)', async () => {
    const { service, prisma } = makeService({ okrsScope: 'SELF' });
    await withCtx({ userId: 'me' }, () => service.list({ ownerUserId: 'someone' }));
    const where = prisma.objective.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.AND).toBeDefined();
  });

  test('SELF getById ⇒ own objective visible, another owner ⇒ 404', async () => {
    const { service } = makeService({ okrsScope: 'SELF' });
    const mine = await withCtx({ userId: 'me' }, () =>
      service.create({ name: 'Mine', ownerUserId: 'me', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-12-31') }),
    );
    const seen = await withCtx({ userId: 'me' }, () => service.getById(mine.id));
    expect(seen.id).toBe(mine.id);
    const theirs = await withCtx({ userId: 'me' }, () =>
      service.create({ name: 'Theirs', ownerUserId: 'other', periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-12-31') }),
    );
    await expect(withCtx({ userId: 'me' }, () => service.getById(theirs.id))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ObjectivesService alignment + period integrity (BE-020)', () => {
  test('an objective cannot be its own parent', async () => {
    const { service } = makeService();
    const a = await withCtx({}, () => service.create({ name: 'A obj', ownerUserId: 'owner', ...period }));
    await expect(withCtx({}, () => service.update(a.id, { parentObjectiveId: a.id }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  test('an objective cannot be parented under its own descendant', async () => {
    const { service, prisma } = makeService();
    const a = await withCtx({}, () => service.create({ name: 'A obj', ownerUserId: 'owner', ...period }));
    const b = await withCtx({}, () =>
      service.create({ name: 'B obj', ownerUserId: 'owner', parentObjectiveId: a.id, ...period }),
    );
    const c = await withCtx({}, () =>
      service.create({ name: 'C obj', ownerUserId: 'owner', parentObjectiveId: b.id, ...period }),
    );
    await expect(withCtx({}, () => service.update(a.id, { parentObjectiveId: c.id }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.objectives.find((o) => o.id === a.id)!.parentObjectiveId).toBeNull();
  });

  test('re-parenting to an unrelated objective still works', async () => {
    const { service } = makeService();
    const a = await withCtx({}, () => service.create({ name: 'A obj', ownerUserId: 'owner', ...period }));
    const b = await withCtx({}, () => service.create({ name: 'B obj', ownerUserId: 'owner', ...period }));
    const updated = await withCtx({}, () => service.update(b.id, { parentObjectiveId: a.id }));
    expect(updated.parentObjectiveId).toBe(a.id);
  });

  test('an update cannot move periodEnd before the stored periodStart', async () => {
    const { service } = makeService();
    const a = await withCtx({}, () => service.create({ name: 'A obj', ownerUserId: 'owner', ...period }));
    await expect(
      withCtx({}, () => service.update(a.id, { periodEnd: new Date('2025-06-01') })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('objective DTO periods (BE-020)', () => {
  test('create rejects periodEnd before periodStart; update rejects an inverted pair', () => {
    const base = { name: 'Grow', ownerUserId: 'o' };
    expect(
      CreateObjectiveDtoSchema.safeParse({ ...base, periodStart: '2026-12-31', periodEnd: '2026-01-01' }).success,
    ).toBe(false);
    expect(CreateObjectiveDtoSchema.safeParse({ ...base, periodStart: '2026-01-01', periodEnd: '2026-12-31' }).success).toBe(
      true,
    );
    expect(UpdateObjectiveDtoSchema.safeParse({ periodStart: '2026-12-31', periodEnd: '2026-01-01' }).success).toBe(false);
    expect(UpdateObjectiveDtoSchema.safeParse({ parentObjectiveId: null }).success).toBe(true);
  });
});
