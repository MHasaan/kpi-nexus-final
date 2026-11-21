/**
 * Manual QA (2026-11-19, F-055): anyone holding KPI_DATA_ENTRY could write values on every organisation-wide
 * KPI (ARR, MRR, churn…), with no approval. An organisation-wide value is now the KPI's owner's or an
 * administrator's to record; integrations and imports keep their own paths.
 */
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

const ORG = 'org_1';

function setup(opts: { ownerUserId?: string | null; isAdmin?: boolean } = {}) {
  const kpi = { id: 'k1', name: 'MRR', scope: 'ORG_WIDE', allowNegative: true, categoryId: null, direction: 'HIGHER_IS_BETTER', ownerUserId: opts.ownerUserId ?? 'olivia' };
  const prisma = {
    kPI: { findFirst: vi.fn(async () => kpi) },
    kPIDataPoint: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p9', orgUnitId: null, userId: null, recordedAt: new Date(), ...data })),
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
    },
    kPICascade: { findMany: vi.fn(async () => []) },
    kPIDependency: { findMany: vi.fn(async () => []) },
  };
  const accessContext = {
    isKpiVisible: vi.fn(async () => true),
    kpiPointScopeWhere: vi.fn(async () => ({})),
    resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: opts.isAdmin ?? false, capabilities: ['KPI_DATA_ENTRY'] })),
  };
  const svc = new KpiDataService(
    prisma as never, { record: vi.fn(async () => {}) } as never, accessContext as never, { publish: vi.fn(async () => {}) } as never,
    { enqueueEvaluateKpi: vi.fn(async () => {}) } as never, { enqueueCascadeRollup: vi.fn(async () => {}), enqueueRecompute: vi.fn(async () => {}) } as never,
  );
  return { svc, prisma };
}
const as = <T>(userId: string, fn: () => Promise<T>, principalType: 'user' | 'api_key' = 'user') =>
  RequestContextStore.run({ userId, organizationId: ORG, roleId: 'r', principalType }, fn) as Promise<T>;
const november = { periodStart: new Date('2026-11-01T00:00:00Z'), periodEnd: new Date('2026-11-30T00:00:00Z') };
const dto = { value: 236_500, ...november, sourceType: 'MANUAL' as const, qualityFlag: 'HIGH' as const };

describe('an organisation-wide value is the owner’s or an administrator’s to record', () => {
  it('someone else with KPI_DATA_ENTRY is refused, and told whose it is to record', async () => {
    const { svc, prisma } = setup();
    const err = await as('jack', () => svc.recordForOrgWideKpi('k1', dto)).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_KPI_OWNER', message: expect.stringMatching(/owner or an administrator/i) });
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
  });

  it('the owner records it', async () => {
    const { svc, prisma } = setup();
    await expect(as('olivia', () => svc.recordForOrgWideKpi('k1', dto))).resolves.toMatchObject({ value: 236_500 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(1);
  });

  it('an administrator records it, owner or not', async () => {
    const { svc, prisma } = setup({ isAdmin: true });
    await expect(as('admin', () => svc.recordForOrgWideKpi('k1', dto))).resolves.toMatchObject({ value: 236_500 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(1);
  });

  it('a KPI with no owner is an administrator’s alone', async () => {
    const { svc, prisma } = setup({ ownerUserId: null });
    await expect(as('jack', () => svc.recordForOrgWideKpi('k1', dto))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
  });

  it('an integration’s key is not held to it: it writes what it is connected to write', async () => {
    const { svc, prisma } = setup();
    await expect(as('key_1', () => svc.recordForOrgWideKpi('k1', dto), 'api_key')).resolves.toMatchObject({ value: 236_500 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(1);
  });

  it('a connector run writes its rows whoever started it: those values are not typed by hand', async () => {
    const { svc, prisma } = setup();
    const result = await as('jack', () => svc.bulkRecordOrgWide([{ kpiId: 'k1', value: 1 }, { kpiId: 'k1', value: 2, sourceType: 'INTEGRATION' }]));
    expect(result).toMatchObject({ succeeded: 2, failed: 0 });
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(2);
  });
});
