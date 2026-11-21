import { describe, expect, it, vi } from 'vitest';

import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { CalculationEngineService } from './calculation-engine.service.js';

const ORG = 'org_alpha';

function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  const ctx: RequestContext = { userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' };
  return RequestContextStore.run(ctx, fn) as Promise<T>;
}

describe('CalculationEngineService.recomputeKpi (AN-002)', () => {
  it("evaluates a formula from each source's newest period, not its newest entry", async () => {
    const prisma = {
      kPI: { findMany: vi.fn(async () => []) },
      kPIDependency: {
        findMany: vi.fn(async () => [{ sourceKpiId: 'kpi_src', formulaRef: 'a' }]),
      },
      formulaExpression: { findFirst: vi.fn(async () => ({ raw: 'a * 2' })) },
      kPIDataPoint: {
        findFirst: vi.fn(async (_args: unknown) => ({ value: 21 })),
        create: vi.fn(async () => ({})),
      },
    };
    const lineage = { record: vi.fn(async () => {}) };
    const service = new CalculationEngineService(prisma as never, {} as never, lineage as never);
    vi.spyOn(service as unknown as { dependentsOf: () => Promise<unknown[]> }, 'dependentsOf').mockResolvedValue([]);

    const result = await withCtx(() => service.recomputeKpi('kpi_formula'));

    expect(result.value).toBe(42);
    expect(prisma.kPIDataPoint.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { kpiId: 'kpi_src', organizationId: ORG },
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
    });
  });
});

describe('CalculationEngineService.rollupParent', () => {
  it("writes the period's one calculated row through the cascade, never a new row per run (F-028)", async () => {
    const prisma = {
      kPICascade: { findMany: vi.fn(async () => [{ childKpiId: 'kpi_child' }]) },
      kPIDataPoint: { create: vi.fn(async () => ({})) },
    };
    const cascade = {
      computeForParent: vi.fn(async () => ({ value: 133_000, contributingChildren: 1, totalDataPoints: 2 })),
      writeComputedPoint: vi.fn(async () => undefined),
    };
    const lineage = { record: vi.fn(async () => {}) };
    const service = new CalculationEngineService(prisma as never, cascade as never, lineage as never);
    vi.spyOn(service as unknown as { parentsOf: () => Promise<unknown[]> }, 'parentsOf').mockResolvedValue([]);
    const start = new Date('2026-11-01T00:00:00Z');
    const end = new Date('2026-11-30T23:59:59Z');

    const result = await withCtx(() => service.rollupParent('kpi_parent', start, end));

    expect(result.value).toBe(133_000);
    expect(cascade.writeComputedPoint).toHaveBeenCalledWith('kpi_parent', start, end, 133_000);
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
  });
});
