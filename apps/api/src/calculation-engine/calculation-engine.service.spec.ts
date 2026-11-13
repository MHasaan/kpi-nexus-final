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
