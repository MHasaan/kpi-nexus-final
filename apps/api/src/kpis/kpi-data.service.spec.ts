import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

// "Latest value" means the newest period, not the newest entry: a backfilled
// older period must not become the KPI's current value.
const PERIOD_ORDER = [{ periodStart: 'desc' }, { recordedAt: 'desc' }];

const mockPrisma = {
  kPI: { findMany: vi.fn() },
  kPIAssignmentUser: { findMany: vi.fn() },
  kPIAssignmentOrgUnit: { findMany: vi.fn() },
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
  mockPrisma.kPIAssignmentUser.findMany.mockResolvedValue([]);
  mockPrisma.kPIAssignmentOrgUnit.findMany.mockResolvedValue([]);
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

// UI-018: a per-person KPI's row carried one value — the newest of anyone the caller may see.
describe('KpiDataService.dashboardSummary — per-person and per-unit KPIs', () => {
  const perPerson = {
    id: 'kpi_calls',
    name: 'Calls',
    scope: 'PER_USER',
    unit: null,
    targetValue: null,
    aggregationMethod: 'LAST',
    scorecardQuadrant: null,
    direction: 'HIGHER_IS_BETTER',
    warningThreshold: null,
    criticalThreshold: null,
  };
  const twoValues = [
    { value: 22, periodStart: new Date('2026-11-01'), recordedAt: new Date('2026-11-03') },
    { value: 44, periodStart: new Date('2026-11-01'), recordedAt: new Date('2026-11-02') },
  ];

  it('seen by someone who sees several holders: a count of them on track, and no single value', async () => {
    mockPrisma.kPI.findMany.mockResolvedValue([perPerson]);
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue(twoValues);
    mockPrisma.kPIAssignmentUser.findMany.mockResolvedValue([
      { kpiId: 'kpi_calls', currentValue: 44, status: 'on_track' },
      { kpiId: 'kpi_calls', currentValue: 22, status: 'behind' },
    ]);
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.holders).toEqual({ total: 2, withValue: 2, onTrack: 1 });
    expect(row!.latestValue).toBeNull();
    expect(row!.aggregatedValue).toBeNull();
    expect(row!.attainmentPct).toBeNull();
    expect(row!.spark).toEqual([]);
    expect(row!.status).toBe('AT_RISK');
    // The holders are counted inside the organisation.
    expect((mockPrisma.kPIAssignmentUser.findMany.mock.calls[0]![0] as { where: { organizationId: string } }).where.organizationId).toBe(ORG);
  });

  it('seen by its one holder: their own value, as before', async () => {
    mockPrisma.kPI.findMany.mockResolvedValue([perPerson]);
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([twoValues[1]]);
    mockPrisma.kPIAssignmentUser.findMany.mockResolvedValue([{ kpiId: 'kpi_calls', currentValue: 44, status: 'on_track' }]);
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.holders).toBeNull();
    expect(row!.latestValue).toBe(44);
  });

  it('an organisation-wide KPI is untouched and counts nobody', async () => {
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.holders).toBeNull();
    expect(mockPrisma.kPIAssignmentUser.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.kPIAssignmentOrgUnit.findMany).not.toHaveBeenCalled();
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

describe('KpiDataService read window (UI-002)', () => {
  it('dashboardSummary keeps periods that overlap the window, including the current one', async () => {
    const from = new Date('2026-10-17T00:00:00Z');
    const to = new Date('2026-11-16T23:59:59.999Z');
    await makeSvc().dashboardSummary({ from, to });
    const { where } = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { periodStart?: { gte?: Date; lte?: Date }; periodEnd?: { gte?: Date; lte?: Date } };
    };
    // The period only has to START before the window ends and END after it begins.
    expect(where.periodStart).toEqual({ lte: to });
    expect(where.periodEnd).toEqual({ gte: from });
    // Nothing requires the period to finish inside the window any more.
    expect(where.periodEnd?.lte).toBeUndefined();
  });

  it('historyWindowDays still bounds how far back a principal may aggregate', async () => {
    mockAccessContext.dataLimits.mockResolvedValue({ historyWindowDays: 30, maxListRows: null, maxExportRows: null });
    await makeSvc().dashboardSummary({ from: new Date('2000-01-01T00:00:00Z') });
    const { where } = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { periodStart?: { gte?: Date } };
    };
    const floor = where.periodStart!.gte!;
    expect(Math.abs(floor.getTime() - (Date.now() - 30 * 86_400_000))).toBeLessThan(5_000);
  });
});

describe('KpiDataService dashboard sparkline (1.5)', () => {
  it('carries the recent periods oldest-first, so a sparkline reads left to right', async () => {
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([
      { value: 300, periodStart: new Date('2026-03-01'), recordedAt: new Date('2026-03-02') },
      { value: 200, periodStart: new Date('2026-02-01'), recordedAt: new Date('2026-02-02') },
      { value: 100, periodStart: new Date('2026-01-01'), recordedAt: new Date('2026-01-02') },
    ]);
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.spark).toEqual([100, 200, 300]);
  });

  it('keeps the most recent periods, not the first ones ever recorded', async () => {
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({
        value: 30 - i, // newest first: 30, 29, … 1
        periodStart: new Date(2026, 0, 30 - i),
        recordedAt: new Date(2026, 0, 30 - i),
      })),
    );
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.spark).toHaveLength(12);
    expect(row!.spark.at(-1)).toBe(30); // the newest period is last
    expect(row!.spark[0]).toBe(19); // twelve periods back
  });

  it('a KPI with no values has nothing to draw', async () => {
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    const [row] = await makeSvc().dashboardSummary();
    expect(row!.spark).toEqual([]);
  });
});
