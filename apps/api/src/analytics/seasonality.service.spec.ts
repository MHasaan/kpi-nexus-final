import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MlClientService } from '../ml/ml-client.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { SeasonalityService } from './seasonality.service.js';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const mockPrisma = {
  kPIDataPoint: {
    findMany: vi.fn(),
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
  dataLimits: vi.fn().mockResolvedValue({
    historyWindowDays: null,
    maxListRows: null,
    maxExportRows: null,
  }),
};

const ORG = 'org_test_123';

function makeSvc(): SeasonalityService {
  return new SeasonalityService(
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
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'user_1',
    roles: [],
  } as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SeasonalityService.decompose', () => {
  it('calls kpis.getById for the visibility gate', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    mockMl.post.mockResolvedValue({
      trend: [],
      seasonal: [],
      resid: [],
      period: 12,
      model: 'additive',
    });

    const svc = makeSvc();
    await svc.decompose('kpi_1', {});

    expect(mockKpis.getById).toHaveBeenCalledWith('kpi_1');
  });

  it('fetches KPI data points scoped to the current organization', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    mockMl.post.mockResolvedValue({ trend: [], seasonal: [], resid: [], period: 12, model: 'additive' });

    const svc = makeSvc();
    await svc.decompose('kpi_1', {});

    expect(mockPrisma.kPIDataPoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG, kpiId: 'kpi_1' }),
      }),
    );
  });

  it('calls ML /seasonality with the correct payload', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    const points = [
      { value: 10, recordedAt: new Date('2024-01-01') },
      { value: 12, recordedAt: new Date('2024-02-01') },
    ];
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([...points].reverse()); // desc from DB
    mockMl.post.mockResolvedValue({ trend: [null, null], seasonal: [1, -1], resid: [0, 0], period: 7, model: 'additive' });

    const svc = makeSvc();
    await svc.decompose('kpi_1', { period: 7, model: 'additive' });

    expect(mockMl.post).toHaveBeenCalledWith('/seasonality', {
      series: [10, 12], // reversed back to chronological
      period: 7,
      model: 'additive',
    });
  });

  it('returns the ML sidecar result directly', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    const mlResult = { trend: [1.0, null], seasonal: [0.5, -0.5], resid: [0.1, -0.1], period: 12, model: 'additive' };
    mockMl.post.mockResolvedValue(mlResult);

    const svc = makeSvc();
    const result = await svc.decompose('kpi_1', {});

    expect(result).toEqual(mlResult);
  });

  it('passes period=undefined when not supplied (let sidecar infer)', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    mockMl.post.mockResolvedValue({ trend: [], seasonal: [], resid: [], period: 12, model: 'additive' });

    const svc = makeSvc();
    await svc.decompose('kpi_1', {}); // no period

    const call = mockMl.post.mock.calls[0] as [string, Record<string, unknown>];
    expect(call[1]).not.toHaveProperty('period', expect.anything());
    // period key should be absent or undefined — it won't be set
    expect(call[1]['period']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Layer-4 history-window clamp (Phase 4)
  // -------------------------------------------------------------------------

  it('applies a recordedAt lower-bound when historyWindowDays is set', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    mockMl.post.mockResolvedValue({ trend: [], seasonal: [], resid: [], period: 12, model: 'additive' });
    mockAccessContext.dataLimits.mockResolvedValue({
      historyWindowDays: 30,
      maxListRows: null,
      maxExportRows: null,
    });

    const before = Date.now();
    const svc = makeSvc();
    await svc.decompose('kpi_1', {});
    const after = Date.now();

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    // Tenancy preserved.
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.kpiId).toBe('kpi_1');
    // recordedAt lower-bound ≈ now - 30 days.
    expect(call.where.recordedAt?.gte).toBeInstanceOf(Date);
    const expectedFloor = before - 30 * 24 * 60 * 60 * 1000;
    const expectedCeil = after - 30 * 24 * 60 * 60 * 1000;
    const gte = call.where.recordedAt!.gte.getTime();
    expect(gte).toBeGreaterThanOrEqual(expectedFloor);
    expect(gte).toBeLessThanOrEqual(expectedCeil);
  });

  it('does not add a recordedAt bound when historyWindowDays is null (parity)', async () => {
    mockKpis.getById.mockResolvedValue({ id: 'kpi_1' });
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    mockMl.post.mockResolvedValue({ trend: [], seasonal: [], resid: [], period: 12, model: 'additive' });
    // default mock: all-null limits

    const svc = makeSvc();
    await svc.decompose('kpi_1', {});

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.kpiId).toBe('kpi_1');
    expect(call.where.recordedAt).toBeUndefined();
  });
});
