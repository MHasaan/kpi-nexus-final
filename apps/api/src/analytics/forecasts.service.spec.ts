import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MlClientService } from '../ml/ml-client.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ForecastsService } from './forecasts.service.js';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  kPIDataPoint: {
    findMany: vi.fn(),
  },
  forecast: {
    create: vi.fn(),
    findMany: vi.fn(async (_args: unknown) => []),
  },
};

const mockMl = {
  post: vi.fn(),
};

const mockKpis = {
  getById: vi.fn(),
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

function makeSvc(): ForecastsService {
  return new ForecastsService(
    mockPrisma as never,
    mockMl as unknown as MlClientService,
    mockKpis as never,
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
  mockPrisma.kPIDataPoint.findMany.mockResolvedValue([
    { value: 1, periodStart: new Date('2026-01-01'), recordedAt: new Date('2026-01-01') },
  ]);
  mockPrisma.forecast.create.mockResolvedValue({ id: 'fc_1' });
  mockMl.post.mockResolvedValue({ predictions: [], fitMetrics: {}, model: 'naive' });
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'user_1',
    roles: [],
  } as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ForecastsService.forecast', () => {
  it('reads KPI data points scoped to the current organization (tenancy preserved)', async () => {
    const svc = makeSvc();
    await svc.forecast('kpi_1', { horizon: 7 });

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
    await svc.forecast('kpi_1', { horizon: 7 });
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
    await svc.forecast('kpi_1', { horizon: 7 });

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.kpiId).toBe('kpi_1');
    expect(call.where.recordedAt).toBeUndefined();
  });
});

describe('ForecastsService.forecast model selection (OT-005)', () => {
  it.each([
    ['prophet', 'PROPHET'],
    ['arima', 'ARIMA'],
  ])('forwards %s with each period start as its timestamp and saves the model the sidecar ran', async (requested, saved) => {
    // Values entered seconds apart for different months: the dates the model
    // sees must be the periods, not the entry times.
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([
      { value: 3, periodStart: new Date('2026-03-01T00:00:00Z'), recordedAt: new Date('2026-11-12T10:00:01Z') },
      { value: 2, periodStart: new Date('2026-02-01T00:00:00Z'), recordedAt: new Date('2026-11-12T10:00:00Z') },
    ]);
    mockMl.post.mockResolvedValue({ predictions: [], fitMetrics: {}, model: requested });

    await makeSvc().forecast('kpi_1', { horizon: 7, model: requested });

    expect(mockMl.post).toHaveBeenCalledWith('/forecast', {
      values: [2, 3],
      timestamps: ['2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z'],
      horizon: 7,
      model: requested,
    });
    expect(mockPrisma.forecast.create.mock.calls[0]![0].data.model).toBe(saved);
    const query = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { orderBy: unknown };
    expect(query.orderBy).toEqual([{ periodStart: 'desc' }, { recordedAt: 'desc' }]);
  });

  it('saves NAIVE when the sidecar fell back, whatever was requested', async () => {
    mockMl.post.mockResolvedValue({ predictions: [], fitMetrics: {}, model: 'naive' });

    await makeSvc().forecast('kpi_1', { horizon: 7, model: 'prophet' });

    expect(mockPrisma.forecast.create.mock.calls[0]![0].data.model).toBe('NAIVE');
  });
});

describe('ForecastsService.forecast with no data (BE-024)', () => {
  it('answers 422 INSUFFICIENT_DATA instead of asking the sidecar to forecast an empty series', async () => {
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    await expect(makeSvc().forecast('kpi_1', { horizon: 7 })).rejects.toMatchObject({
      status: 422,
      response: { code: 'INSUFFICIENT_DATA' },
    });
    expect(mockMl.post).not.toHaveBeenCalled();
  });
});

describe('ForecastsService.forecast — ANALYTICS scope (BE-004)', () => {
  it('a visible KPI outside the ANALYTICS scope is a 404 and never reaches the sidecar', async () => {
    mockAccessContext.isKpiAnalyticsAllowed.mockResolvedValueOnce(false);
    await expect(makeSvc().forecast('kpi_1', { horizon: 7 })).rejects.toMatchObject({ status: 404 });
    expect(mockMl.post).not.toHaveBeenCalled();
    expect(mockPrisma.kPIDataPoint.findMany).not.toHaveBeenCalled();
  });
});

describe('ForecastsService — per-user point scope (BE-034)', () => {
  it('reads only the points the caller may analyse (a PER_USER KPI: their own)', async () => {
    mockKpis.getById.mockResolvedValueOnce({ id: 'kpi_1', scope: 'PER_USER' });
    mockAccessContext.analyticsPointScopeWhere.mockResolvedValueOnce({ userId: { in: ['user_1'] } });
    const svc = makeSvc();
    await svc.forecast('kpi_1', { horizon: 7 }).catch(() => undefined);
    expect(mockAccessContext.analyticsPointScopeWhere).toHaveBeenCalledWith('PER_USER');
    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where).toMatchObject({ kpiId: 'kpi_1', userId: { in: ['user_1'] } });
  });
});

describe('ForecastsService stored forecasts (BE-034)', () => {
  it('records who generated a forecast', async () => {
    await makeSvc().forecast('kpi_1', { horizon: 7 });
    const data = (mockPrisma.forecast.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.createdById).toBe('user_1');
  });

  it('a caller with full reach lists every stored forecast for the KPI', async () => {
    await makeSvc().list('kpi_1');
    const where = (mockPrisma.forecast.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).not.toHaveProperty('createdById');
  });

  it('a caller with restricted point scope lists only the forecasts they generated', async () => {
    mockKpis.getById.mockResolvedValueOnce({ id: 'kpi_1', scope: 'PER_USER' });
    mockAccessContext.analyticsPointScopeWhere.mockResolvedValueOnce({ userId: { in: ['user_1'] } });
    await makeSvc().list('kpi_1');
    const where = (mockPrisma.forecast.findMany.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ kpiId: 'kpi_1', createdById: 'user_1' });
  });
});

describe('ForecastsService.forecast persist:false (NLQ tool)', () => {
  it('runs the forecast without saving a row', async () => {
    mockMl.post.mockResolvedValueOnce({ predictions: [{ ds: '2026-12-01', yhat: 5 }], fitMetrics: {}, model: 'naive' });
    const out = await makeSvc().forecast('kpi_1', { horizon: 3, persist: false });
    expect(mockPrisma.forecast.create).not.toHaveBeenCalled();
    expect(out).toMatchObject({ kpiId: 'kpi_1', horizon: 3, model: 'NAIVE', predictions: [{ ds: '2026-12-01', yhat: 5 }] });
  });
});
