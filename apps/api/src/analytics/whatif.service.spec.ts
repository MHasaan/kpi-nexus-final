import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MlClientService } from '../ml/ml-client.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { WhatIfService } from './whatif.service.js';

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
  // ANALYTICS ceiling (BE-004): allowed unless a test says otherwise.
  isKpiAnalyticsAllowed: vi.fn(async () => true),
  dataLimits: vi.fn().mockResolvedValue({
    historyWindowDays: null,
    maxListRows: null,
    maxExportRows: null,
  }),
};

const ORG = 'org_test_123';

function makeSvc(): WhatIfService {
  return new WhatIfService(
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
  mockPrisma.kPIDataPoint.findMany.mockResolvedValue([{ value: 1, recordedAt: new Date('2026-01-01') }]);
  mockMl.post.mockResolvedValue({ baseline: [], scenarios: [] });
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'user_1',
    roles: [],
  } as never);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WhatIfService.simulate', () => {
  it('reads the baseline scoped to the current organization (tenancy preserved)', async () => {
    const svc = makeSvc();
    await svc.simulate('kpi_1', { scenarios: [{ deltaPct: 10 }] });

    expect(mockKpis.getById).toHaveBeenCalledWith('kpi_1');
    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
      take: number;
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
    await svc.simulate('kpi_1', { scenarios: [{ deltaPct: 10 }], baselineCount: 12 });
    const after = Date.now();

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
      take: number;
    };
    expect(call.where.organizationId).toBe(ORG);
    // existing take behaviour preserved.
    expect(call.take).toBe(12);
    expect(call.where.recordedAt?.gte).toBeInstanceOf(Date);
    const expectedFloor = before - 30 * 24 * 60 * 60 * 1000;
    const expectedCeil = after - 30 * 24 * 60 * 60 * 1000;
    const gte = call.where.recordedAt!.gte.getTime();
    expect(gte).toBeGreaterThanOrEqual(expectedFloor);
    expect(gte).toBeLessThanOrEqual(expectedCeil);
  });

  it('does not add a recordedAt bound when historyWindowDays is null (parity)', async () => {
    const svc = makeSvc();
    await svc.simulate('kpi_1', { scenarios: [{ deltaPct: 10 }] });

    const call = mockPrisma.kPIDataPoint.findMany.mock.calls[0]![0] as {
      where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } };
    };
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.kpiId).toBe('kpi_1');
    expect(call.where.recordedAt).toBeUndefined();
  });
});

describe('WhatIfService.simulate with no data (BE-024)', () => {
  it('answers 422 INSUFFICIENT_DATA instead of simulating an empty baseline', async () => {
    mockPrisma.kPIDataPoint.findMany.mockResolvedValue([]);
    await expect(makeSvc().simulate('kpi_1', { scenarios: [{ deltaPct: 10 }] })).rejects.toMatchObject({
      status: 422,
      response: { code: 'INSUFFICIENT_DATA' },
    });
    expect(mockMl.post).not.toHaveBeenCalled();
  });
});
