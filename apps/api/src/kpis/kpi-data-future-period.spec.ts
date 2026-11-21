/**
 * Manual QA (2026-11-19, F-037): on 19 November a value for December was accepted without a word, became the
 * KPI's latest value and fired an alert. A period that has not begun takes no recorded value.
 */
import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

const ORG = 'org_1';

function setup() {
  const kpi = { id: 'k1', name: 'MRR', scope: 'ORG_WIDE', allowNegative: true, categoryId: null, direction: 'HIGHER_IS_BETTER' };
  const prisma = {
    kPI: { findFirst: vi.fn(async () => kpi) },
    kPIDataPoint: {
      findFirst: vi.fn(async () => null),
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
const month = (start: string, end: string, sourceType: 'MANUAL' | 'INTEGRATION' = 'MANUAL') => ({
  value: 10,
  periodStart: new Date(`${start}T00:00:00Z`),
  periodEnd: new Date(`${end}T00:00:00Z`),
  sourceType,
  qualityFlag: 'HIGH' as const,
});

afterEach(() => vi.useRealTimers());

describe('no values for a period that has not begun', () => {
  it('a value for next month is refused, and nothing is written', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T10:00:00Z') });
    const { svc, prisma } = setup();
    const err = await asMe(() => svc.recordForOrgWideKpi('k1', month('2026-12-01', '2026-12-31'))).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'PERIOD_NOT_BEGUN', message: expect.stringMatching(/not begun/i) });
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
  });

  it('the current period and past periods are recorded', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T10:00:00Z') });
    const { svc, prisma } = setup();
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', month('2026-11-01', '2026-11-30')))).resolves.toMatchObject({ value: 10 });
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', month('2026-10-01', '2026-10-31')))).resolves.toMatchObject({ value: 10 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(2);
  });

  it("a period that begins today anywhere on Earth is not refused: the check allows a day's grace", async () => {
    vi.useFakeTimers({ now: new Date('2026-11-30T20:00:00Z') }); // already 1 December east of here
    const { svc } = setup();
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', month('2026-12-01', '2026-12-31')))).resolves.toMatchObject({ value: 10 });
  });

  it('an integration is held to it too', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-19T10:00:00Z') });
    const { svc } = setup();
    await expect(asMe(() => svc.recordForOrgWideKpi('k1', month('2027-01-01', '2027-01-31', 'INTEGRATION')))).rejects.toMatchObject({
      response: { code: 'PERIOD_NOT_BEGUN' },
    });
  });
});
