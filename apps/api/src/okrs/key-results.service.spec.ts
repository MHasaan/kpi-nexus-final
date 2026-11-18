/**
 * KeyResultsService unit tests. Verifies KR CRUD is org + objective scoped,
 * initial progress is computed on create, and every mutation triggers an
 * objective recompute (via the injected ObjectivesService).
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { KeyResultsService } from './key-results.service.js';
import type { ObjectivesService } from './objectives.service.js';

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

class FakePrisma {
  private n = 1;
  krs: FakeKr[] = [];

  keyResult = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.krs.filter((k) => k.organizationId === where.organizationId && k.objectiveId === where.objectiveId),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.krs.find((k) => k.id === where.id && k.organizationId === where.organizationId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const k: FakeKr = {
        id: `kr_${this.n++}`,
        organizationId: data.organizationId as string,
        objectiveId: data.objectiveId as string,
        name: data.name as string,
        description: (data.description as string) ?? null,
        kpiId: (data.kpiId as string) ?? null,
        baselineValue: (data.baselineValue as number) ?? null,
        targetValue: data.targetValue as number,
        currentValue: (data.currentValue as number) ?? null,
        weight: (data.weight as number) ?? 1,
        progress: (data.progress as number) ?? 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.krs.push(k);
      return k;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const k = this.krs.find((x) => x.id === where.id)!;
      for (const key of Object.keys(data)) if (data[key] !== undefined) (k as unknown as Record<string, unknown>)[key] = data[key];
      return k;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.krs = this.krs.filter((k) => k.id !== where.id);
      return {};
    }),
  };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'owner', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const objectives = {
    getById: vi.fn(async (id: string) => ({ id, organizationId: ORG, ownerUserId: 'owner' })),
    linkedKpiValue: vi.fn(async (_ownerUserId: string | null, _kpiId: string): Promise<number | null> => 42),
    recomputeObjectiveProgress: vi.fn(async () => {}),
    assertKpiLinkable: vi.fn(async (_kpiId: string) => {}),
  };
  const service = new KeyResultsService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
    objectives as unknown as ObjectivesService,
  );
  return { service, prisma, objectives };
}

describe('KeyResultsService', () => {
  test('create computes initial progress and recomputes the objective', async () => {
    const { service, objectives } = makeService();
    const kr = await withCtx({}, () =>
      service.create('obj_1', { name: 'Revenue', baselineValue: 0, targetValue: 100, currentValue: 25, weight: 2 }),
    );
    expect(kr.progress).toBeCloseTo(0.25);
    expect(objectives.recomputeObjectiveProgress).toHaveBeenCalledWith('obj_1');
  });

  test('create on a missing/foreign objective → 404 (objective check)', async () => {
    const { service, objectives } = makeService();
    objectives.getById = vi.fn(async (_id: string): Promise<{ id: string; organizationId: string; ownerUserId: string }> => {
      throw new NotFoundException();
    });
    await expect(withCtx({}, () => service.create('ghost', { name: 'X', targetValue: 10 }))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('update recomputes progress and the objective', async () => {
    const { service, objectives } = makeService();
    const kr = await withCtx({}, () => service.create('obj_1', { name: 'R', baselineValue: 0, targetValue: 100, currentValue: 0 }));
    objectives.recomputeObjectiveProgress.mockClear();
    const u = await withCtx({}, () => service.update(kr.id, { currentValue: 80 }));
    expect(u.progress).toBeCloseTo(0.8);
    expect(objectives.recomputeObjectiveProgress).toHaveBeenCalledWith('obj_1');
  });

  test('update cross-tenant → 404', async () => {
    const { service } = makeService();
    const kr = await withCtx({ organizationId: 'a' }, () => service.create('obj_1', { name: 'R', targetValue: 100 }));
    await expect(withCtx({ organizationId: 'b' }, () => service.update(kr.id, { currentValue: 1 }))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('remove deletes and recomputes the objective', async () => {
    const { service, prisma, objectives } = makeService();
    const kr = await withCtx({}, () => service.create('obj_1', { name: 'R', targetValue: 100 }));
    objectives.recomputeObjectiveProgress.mockClear();
    await withCtx({}, () => service.remove(kr.id));
    expect(prisma.krs).toHaveLength(0);
    expect(objectives.recomputeObjectiveProgress).toHaveBeenCalledWith('obj_1');
  });

  // BE-055: the linked KPI is checked before anything is written.
  test('create with a linked KPI checks the KPI first, and writes nothing when it is refused', async () => {
    const { service, prisma, objectives } = makeService();
    await withCtx({}, () => service.create('o1', { name: 'KR', targetValue: 10, kpiId: 'kpi_ok', weight: 1 }));
    expect(objectives.assertKpiLinkable).toHaveBeenCalledWith('kpi_ok');

    objectives.assertKpiLinkable.mockRejectedValueOnce(new NotFoundException());
    await expect(withCtx({}, () => service.create('o1', { name: 'KR2', targetValue: 10, kpiId: 'kpi_hidden', weight: 1 }))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.krs).toHaveLength(1);
  });

  test('update checks a newly linked KPI; unlinking and other edits are not checked', async () => {
    const { service, prisma, objectives } = makeService();
    const kr = await withCtx({}, () => service.create('o1', { name: 'KR', targetValue: 10, weight: 1 }));
    await withCtx({}, () => service.update(kr.id, { name: 'Renamed' }));
    await withCtx({}, () => service.update(kr.id, { kpiId: null }));
    expect(objectives.assertKpiLinkable).not.toHaveBeenCalled();

    objectives.assertKpiLinkable.mockRejectedValueOnce(new NotFoundException());
    await expect(withCtx({}, () => service.update(kr.id, { kpiId: 'kpi_hidden' }))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.krs[0]!.kpiId).toBeNull();
  });

  // QA-L9: a key result linked to a KPI showed no value until someone pressed "Sync".
  test('create with a linked KPI and no value of its own starts from the KPI\'s value', async () => {
    const { service, objectives } = makeService();
    const kr = await withCtx({}, () => service.create('o1', { name: 'KR', baselineValue: 0, targetValue: 84, kpiId: 'kpi_1', weight: 1 }));
    expect(objectives.linkedKpiValue).toHaveBeenCalledWith('owner', 'kpi_1');
    expect(kr.currentValue).toBe(42);
    expect(kr.progress).toBeCloseTo(0.5);
  });

  test('create keeps a value that was typed, and stays empty when the KPI has none', async () => {
    const { service, objectives } = makeService();
    const typed = await withCtx({}, () => service.create('o1', { name: 'KR', targetValue: 84, kpiId: 'kpi_1', currentValue: 3, weight: 1 }));
    expect(typed.currentValue).toBe(3);
    expect(objectives.linkedKpiValue).not.toHaveBeenCalled();

    objectives.linkedKpiValue.mockResolvedValueOnce(null);
    const empty = await withCtx({}, () => service.create('o1', { name: 'KR2', targetValue: 84, kpiId: 'kpi_2', weight: 1 }));
    expect(empty.currentValue).toBeNull();
  });

  test('update takes the KPI\'s value when a KPI is newly linked, and not on other edits', async () => {
    const { service, objectives } = makeService();
    const kr = await withCtx({}, () => service.create('o1', { name: 'KR', baselineValue: 0, targetValue: 84, currentValue: 1, weight: 1 }));
    const linked = await withCtx({}, () => service.update(kr.id, { kpiId: 'kpi_1' }));
    expect(linked.currentValue).toBe(42);
    expect(linked.progress).toBeCloseTo(0.5);

    objectives.linkedKpiValue.mockClear();
    await withCtx({}, () => service.update(kr.id, { name: 'Renamed' }));
    await withCtx({}, () => service.update(kr.id, { kpiId: 'kpi_1', currentValue: 7 }));
    expect(objectives.linkedKpiValue).not.toHaveBeenCalled();
  });

  test('list is org + objective scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create('obj_1', { name: 'A', targetValue: 100 }));
    await withCtx({}, () => service.create('obj_2', { name: 'B', targetValue: 100 }));
    const rows = await withCtx({}, () => service.list('obj_1'));
    expect(rows.map((r) => r.name)).toEqual(['A']);
  });
});
