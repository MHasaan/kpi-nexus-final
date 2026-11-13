import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

// "Latest value" means the newest period, not the newest entry: a backfilled
// older period must not become the KPI's current value.
const PERIOD_ORDER = [{ periodStart: 'desc' }, { recordedAt: 'desc' }];

const mockPrisma = {
  kPI: { findMany: vi.fn() },
  kPIThresholdBand: { findMany: vi.fn() },
  kPIDataPoint: { findMany: vi.fn() },
};

const mockAccessContext = {
  dataLimits: vi.fn(),
};

const ORG = 'org_test_123';

function makeSvc(): KpiDataService {
  const svc = new KpiDataService(
    mockPrisma as never,
    {} as never,
    mockAccessContext as never,
    {} as never,
    {} as never,
    {} as never,
  );
  vi.spyOn(svc as unknown as { buildVisibilityContext: () => Promise<unknown> }, 'buildVisibilityContext').mockResolvedValue({
    organizationId: ORG,
    userId: 'user_1',
    isAdmin: true,
  } as never);
  return svc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAccessContext.dataLimits.mockResolvedValue({ historyWindowDays: null, maxListRows: null, maxExportRows: null });
  mockPrisma.kPI.findMany.mockResolvedValue([
    {
      id: 'kpi_1',
      name: 'Revenue',
      scope: 'ORG_WIDE',
      unit: null,
      targetValue: null,
      aggregationMethod: 'LAST',
      scorecardQuadrant: null,
      direction: 'HIGHER_IS_BETTER',
      warningThreshold: null,
      criticalThreshold: null,
    },
  ]);
  mockPrisma.kPIThresholdBand.findMany.mockResolvedValue([]);
  mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'user_1',
    roles: [],
  } as never);
});

describe('KpiDataService.dashboardSummary', () => {
  it('reads data points newest period first, so latestValue is the newest period', async () => {
    await makeSvc().dashboardSummary();
    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { orderBy: unknown; where: { organizationId: string } };
    expect(call.orderBy).toEqual(PERIOD_ORDER);
    expect(call.where.organizationId).toBe(ORG);
  });

  it('takes latestValue and LAST aggregation from the first (newest-period) row', async () => {
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([
      { value: 200, periodStart: new Date('2026-03-01'), recordedAt: new Date('2026-03-02') },
      { value: 50, periodStart: new Date('2025-01-01'), recordedAt: new Date('2026-04-01') },
    ]);
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.latestValue).toBe(200);
    expect(row!.aggregatedValue).toBe(200);
  });
});

describe('KpiDataService outlier priors', () => {
  it('compares a new value against the newest periods, not the newest entries', async () => {
    await (makeSvc() as unknown as {
      computeOutlierFlag(p: unknown): Promise<boolean>;
    }).computeOutlierFlag({
      organizationId: ORG,
      kpiId: 'kpi_1',
      orgUnitId: null,
      userId: null,
      dto: { value: 10 },
    });
    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { orderBy: unknown; take: number };
    expect(call.orderBy).toEqual(PERIOD_ORDER);
    expect(call.take).toBe(30);
  });
});
