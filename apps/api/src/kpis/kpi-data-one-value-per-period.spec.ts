/**
 * Manual QA (2026-11-19, F-017): a value could be recorded twice for the same period from the form, with no
 * warning, and the second row could neither be moved nor removed. A period now takes one recorded value per
 * holder; a second is refused and pointed at Correct. Values that arrive from integrations, imports or the
 * engine are not affected.
 */
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

const ORG = 'org_1';

function setup(opts: { existing?: Array<{ id: string; sourceType: string; orgUnitId: string | null; userId: string | null }> } = {}) {
  const kpi = { id: 'k1', name: 'MRR', scope: 'ORG_WIDE', allowNegative: true, categoryId: null, direction: 'HIGHER_IS_BETTER' };
  const prisma = {
    kPI: { findFirst: vi.fn(async () => kpi) },
    kPIDataPoint: {
      // The same-period check reads with the holder in its where; the outlier check reads a window.
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        (opts.existing ?? []).find((p) => (where.orgUnitId === undefined || p.orgUnitId === where.orgUnitId) && (where.userId === undefined || p.userId === where.userId)) ?? null,
      ),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p9', orgUnitId: null, userId: null, recordedAt: new Date(), ...data })),
    },
    kPICascade: { findMany: vi.fn(async () => []) },
    kPIDependency: { findMany: vi.fn(async () => []) },
  };
  const accessContext = {
    isKpiVisible: vi.fn(async () => true),
    kpiPointScopeWhere: vi.fn(async () => ({})),
    resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: true, capabilities: ['KPI_DATA_ENTRY'] })),
  };
  const svc = new KpiDataService(
    prisma as never, { record: vi.fn(async () => {}) } as never, accessContext as never, { publish: vi.fn(async () => {}) } as never,
    { enqueueEvaluateKpi: vi.fn(async () => {}) } as never, { enqueueCascadeRollup: vi.fn(async () => {}), enqueueRecompute: vi.fn(async () => {}) } as never,
  );
  return { svc, prisma };
}
const asMe = <T>(fn: () => Promise<T>) =>
  RequestContextStore.run({ userId: 'me', organizationId: ORG, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;
const november = { periodStart: new Date('2026-11-01T00:00:00Z'), periodEnd: new Date('2026-11-30T00:00:00Z') };
const dto = (value: number, sourceType: 'MANUAL' | 'INGESTION' | 'INTEGRATION' = 'MANUAL') => ({ value, ...november, sourceType, qualityFlag: 'HIGH' as const });

describe('one recorded value per period', () => {
  it('a second value recorded by hand for a period that has one is refused, pointing at Correct', async () => {
    const { svc, prisma } = setup({ existing: [{ id: 'p1', sourceType: 'MANUAL', orgUnitId: null, userId: null }] });
    const err = await asMe(() => svc.recordForOrgWideKpi('k1', dto(231_000))).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toMatchObject({ code: 'PERIOD_ALREADY_RECORDED', message: expect.stringMatching(/already recorded.*Correct/i) });
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
    // The check is for this KPI, this holder and this period only.
    expect(prisma.kPIDataPoint.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG, kpiId: 'k1', orgUnitId: null, userId: null, periodStart: november.periodStart }) }),
    );
  });

  it('the first value for a period is recorded', async () => {
    const { svc, prisma } = setup();
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', dto(236_500)))).resolves.toMatchObject({ value: 236_500 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(1);
  });

  it('a value from an integration or an import is not held to it: those sources manage their own periods', async () => {
    const { svc, prisma } = setup({ existing: [{ id: 'p1', sourceType: 'INTEGRATION', orgUnitId: null, userId: null }] });
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', dto(1, 'INTEGRATION')))).resolves.toMatchObject({ value: 1 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(1);
  });

  it("a calculated row for the period does not block a recorded one: they are different things", async () => {
    const { svc, prisma } = setup({ existing: [{ id: 'c1', sourceType: 'COMPUTED', orgUnitId: null, userId: null }] });
    prisma.kPIDataPoint.findFirst = vi.fn(async ({ where }: { where: { sourceType?: unknown } }) => (where.sourceType === undefined ? { id: 'c1', sourceType: 'COMPUTED' } : null)) as never;
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', dto(5)))).resolves.toMatchObject({ value: 5 });
  });
});
