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
    getById: vi.fn(async (id: string) => ({ id, organizationId: ORG })),
    recomputeObjectiveProgress: vi.fn(async () => {}),
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
    objectives.getById = vi.fn(async (_id: string): Promise<{ id: string; organizationId: string }> => {
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

  test('list is org + objective scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create('obj_1', { name: 'A', targetValue: 100 }));
    await withCtx({}, () => service.create('obj_2', { name: 'B', targetValue: 100 }));
    const rows = await withCtx({}, () => service.list('obj_1'));
    expect(rows.map((r) => r.name)).toEqual(['A']);
  });
});
