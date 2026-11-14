import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MlClientService } from '../ml/ml-client.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import type { RecommendationsService } from '../recommendations/recommendations.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { AnomalyService } from './anomaly.service.js';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  kPIDataPoint: {
    findMany: vi.fn(),
  },
  anomalyDetection: {
    findMany: vi.fn(async (_args: unknown): Promise<Array<{ id: string; dataPointId: string | null }>> => []),
  },
};

const mockMl = {
  post: vi.fn(),
};

const mockKpis = {
  getById: vi.fn(),
};

const mockRecommendations = {
  generateInOrg: vi.fn(),
};

// Layer-4 data limits — null ⇒ unlimited / parity (admin default).
const mockAccessContext = {
  // ANALYTICS ceiling (BE-004): allowed unless a test says otherwise.
  isKpiAnalyticsAllowed: vi.fn(async () => true),
  // Point scope for analytics (BE-034): unrestricted unless a test narrows it.
  analyticsPointScopeWhere: vi.fn(async (_kpiScope: string): Promise<Record<string, unknown>> => ({})),
  dataLimits: vi.fn().mockResolvedValue({
    historyWindowDays: null,
    maxListRows: null,
    maxExportRows: null,
  }),
};

const ORG = 'org_test_123';

// Two points so detect() proceeds past the `< 2` short-circuit and calls the sidecar.
const TWO_POINTS = [
  { id: 'dp_2', value: 12, periodStart: new Date('2024-02-01'), recordedAt: new Date('2024-03-05T10:00:00Z') },
  { id: 'dp_1', value: 10, periodStart: new Date('2024-01-01'), recordedAt: new Date('2024-03-05T10:00:01Z') },
]; // desc order, as the DB returns

function makeSvc(): AnomalyService {
  return new AnomalyService(
    mockPrisma as never,
    mockMl as unknown as MlClientService,
    mockKpis as never,
    mockRecommendations as unknown as RecommendationsService,
    mockAccessContext as unknown as AccessContextService,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm the default (parity / unlimited) limits after clearAllMocks wiped it.
  mockAccessContext.dataLimits.mockResolvedValue({
    historyWindowDays: null,
    maxListRows: null,
    maxExportRows: null,
  });
  mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
  mockPrisma.kPIDataPoint.findMany.mockResolvedValue(TWO_POINTS);
  mockMl.post.mockResolvedValue({ anomalies: [] });
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'user_1',
    roles: [],
  } as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnomalyService.detect', () => {
  it('reads the series scoped to the current organization (tenancy preserved)', async () => {
    const svc = makeSvc();
    await svc.detect('kpi_1');

    expect(mockKpis.getById).toHaveBeenCalledWith('kpi_1');
    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.kpiId).toBe('kpi_1');
  });

  // -------------------------------------------------------------------------
  // Layer-4 history-window clamp (Phase 4)
  // -------------------------------------------------------------------------

  it('applies a recordedAt lower-bound when historyWindowDays is set', async () => {
    mockAccessContext.dataLimits.mockResolvedValue({
      historyWindowDays: 30,
      maxListRows: null,
      maxExportRows: null,
    });

    const before = Date.now();
    const svc = makeSvc();
    await svc.detect('kpi_1');
    const after = Date.now();

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.recordedAt?.gte).toBeInstanceOf(Date);
    const expectedFloor = before - 30 * 24 * 60 * 60 * 1000;
    const expectedCeil = after - 30 * 24 * 60 * 60 * 1000;
    const gte = call.where.recordedAt!.gte.getTime();
    expect(gte).toBeGreaterThanOrEqual(expectedFloor);
    expect(gte).toBeLessThanOrEqual(expectedCeil);
  });

  it('does not add a recordedAt bound when historyWindowDays is null (parity)', async () => {
    const svc = makeSvc();
    await svc.detect('kpi_1');

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.kpiId).toBe('kpi_1');
    expect(call.where.recordedAt).toBeUndefined();
  });
});

describe('AnomalyService.detect — period order', () => {
  it('reads the newest periods, not the newest entries (backfills entered out of order)', async () => {
    await makeSvc().detect('kpi_1');
    const query = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { orderBy: unknown };
    expect(query.orderBy).toEqual([{ periodStart: 'desc' }, { recordedAt: 'desc' }]);
  });

  it('sends each period start as the timestamp', async () => {
    await makeSvc().detect('kpi_1');
    const payload = mockMl.post.mock.calls[0]![1] as { values: number[]; timestamps: string[] };
    expect(payload.values).toEqual([10, 12]);
    expect(payload.timestamps).toEqual(['2024-01-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z']);
  });
});

describe('AnomalyService — per-user point scope (BE-034)', () => {
  it('reads only the points the caller may analyse (a PER_USER KPI: their own)', async () => {
    mockKpis.getById.mockResolvedValueOnce({ id: 'kpi_1', scope: 'PER_USER' });
    mockAccessContext.analyticsPointScopeWhere.mockResolvedValueOnce({ userId: { in: ['user_1'] } });
    const svc = makeSvc();
    await svc.detect('kpi_1').catch(() => undefined);
    expect(mockAccessContext.analyticsPointScopeWhere).toHaveBeenCalledWith('PER_USER');
    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where).toMatchObject({ kpiId: 'kpi_1', userId: { in: ['user_1'] } });
  });
});

describe('AnomalyService.list — per-user point scope (BE-034)', () => {
  const rows = [
    { id: 'a1', dataPointId: 'mine' },
    { id: 'a2', dataPointId: 'someone-elses' },
    { id: 'a3', dataPointId: null },
  ];

  it('a caller with full reach sees every stored anomaly', async () => {
    mockPrisma.anomalyDetection.findMany.mockResolvedValueOnce(rows);
    const out = await makeSvc().list('kpi_1', {});
    expect(out.map((r) => r.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('a restricted caller sees only anomalies on points they may read', async () => {
    mockKpis.getById.mockResolvedValueOnce({ id: 'kpi_1', scope: 'PER_USER' });
    mockAccessContext.analyticsPointScopeWhere.mockResolvedValueOnce({ userId: { in: ['user_1'] } });
    mockPrisma.anomalyDetection.findMany.mockResolvedValueOnce(rows);
    mockPrisma.kPIDataPoint.findMany.mockResolvedValueOnce([{ id: 'mine' }]);
    const out = await makeSvc().list('kpi_1', {});
    expect(out.map((r) => r.id)).toEqual(['a1']);
    const pointQuery = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(pointQuery.where).toMatchObject({ id: { in: ['mine', 'someone-elses'] }, userId: { in: ['user_1'] } });
  });
});
