/**
 * KPI.allowNegative (default false) is enforced wherever a person or an
 * integration supplies a value: recording on any scope's endpoint, bulk ingest,
 * and correcting a recorded value. A negative value on a KPI that disallows it
 * is refused with 422 NEGATIVE_NOT_ALLOWED and nothing is written.
 */
import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

const ORG = 'org_1';

function setup(opts: { allowNegative: boolean; scope?: 'ORG_WIDE' | 'PER_USER' }) {
  const scope = opts.scope ?? 'ORG_WIDE';
  const kpi = { id: 'k1', name: 'Calls', scope, allowNegative: opts.allowNegative, categoryId: null, direction: 'HIGHER_IS_BETTER', ownerUserId: 'me' };
  const point = {
    id: 'p1', organizationId: ORG, kpiId: 'k1', userId: 'me', orgUnitId: null, value: 10, note: null, recordedById: 'me', sourceType: 'MANUAL',
    periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), recordedAt: new Date('2026-11-01'),
  };
  const tx = {
    kPIDataPoint: { update: vi.fn(async ({ data }: { data: object }) => ({ ...point, ...data })) },
    kPIDataPointHistory: { create: vi.fn(async () => ({ id: 'h1' })) },
  };
  const prisma = {
    kPI: { findFirst: vi.fn(async () => kpi) },
    kPIAssignmentUser: {
      findFirst: vi.fn(async () => ({ id: 'a1', kpiId: 'k1', userId: 'me', targetValue: 100, kpi })),
      update: vi.fn(async () => ({})),
    },
    kPIDataPoint: {
      // The point itself when asked for by id (a correction); nothing for the same-period check (F-017).
      findFirst: vi.fn(async ({ where }: { where: { id?: string } }) => (where.id ? point : null)),
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'p9', orgUnitId: null, userId: null, recordedAt: new Date(), ...data })),
    },
    kPICascade: { findMany: vi.fn(async () => []) },
    kPIDependency: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const accessContext = {
    isKpiVisible: vi.fn(async () => true),
    kpiPointScopeWhere: vi.fn(async () => ({})),
    resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: false, capabilities: ['KPI_DATA_ENTRY'] })),
  };
  const svc = new KpiDataService(
    prisma as never, { record: vi.fn(async () => {}) } as never, accessContext as never, { publish: vi.fn(async () => {}) } as never,
    { enqueueEvaluateKpi: vi.fn(async () => {}) } as never, { enqueueCascadeRollup: vi.fn(async () => {}), enqueueRecompute: vi.fn(async () => {}) } as never,
  );
  return { svc, prisma, tx };
}

const asMe = <T>(fn: () => Promise<T>) =>
  RequestContextStore.run({ userId: 'me', organizationId: ORG, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;
const dto = (value: number) => ({ value, periodStart: new Date(), periodEnd: new Date(), sourceType: 'MANUAL' as const, qualityFlag: 'HIGH' as const });

async function expectRefused(p: Promise<unknown>) {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(UnprocessableEntityException);
  expect((err as UnprocessableEntityException).getResponse()).toMatchObject({ code: 'NEGATIVE_NOT_ALLOWED' });
}

describe('KPI.allowNegative', () => {
  it('recording a negative value on an ORG_WIDE KPI that disallows it is 422 and writes nothing', async () => {
    const { svc, prisma } = setup({ allowNegative: false });
    await expectRefused(asMe(() => svc.recordForOrgWideKpi('k1', dto(-5))));
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
  });

  it('recording a negative value on my PER_USER assignment is refused the same way', async () => {
    const { svc, prisma } = setup({ allowNegative: false, scope: 'PER_USER' });
    await expectRefused(asMe(() => svc.recordForMyUserAssignment('a1', dto(-1))));
    expect(prisma.kPIDataPoint.create).not.toHaveBeenCalled();
    expect(prisma.kPIAssignmentUser.update).not.toHaveBeenCalled();
  });

  it('zero and positive values are accepted; negatives are accepted when the KPI allows them', async () => {
    const strict = setup({ allowNegative: false });
    await expect(asMe(() => strict.svc.recordForOrgWideKpi('k1', dto(0)))).resolves.toMatchObject({ value: 0 });
    const lenient = setup({ allowNegative: true });
    await expect(asMe(() => lenient.svc.recordForOrgWideKpi('k1', dto(-5)))).resolves.toMatchObject({ value: -5 });
  });

  it('bulk ingest counts a negative row as failed and records the rest', async () => {
    const { svc, prisma } = setup({ allowNegative: false });
    const out = await asMe(() => svc.bulkRecordOrgWide([{ kpiId: 'k1', value: 3 }, { kpiId: 'k1', value: -2 }]));
    expect(out).toMatchObject({ succeeded: 1, failed: 1 });
    expect(out.errors[0]).toMatch(/negative/i);
    expect(prisma.kPIDataPoint.create).toHaveBeenCalledTimes(1);
  });

  it('correcting a value to a negative one is refused when the KPI disallows it, allowed otherwise', async () => {
    const strict = setup({ allowNegative: false });
    await expectRefused(asMe(() => strict.svc.correctDataPoint('k1', 'p1', { value: -3, reason: 'Refund' })));
    expect(strict.tx.kPIDataPoint.update).not.toHaveBeenCalled();
    const lenient = setup({ allowNegative: true });
    await expect(asMe(() => lenient.svc.correctDataPoint('k1', 'p1', { value: -3, reason: 'Refund' }))).resolves.toMatchObject({ value: -3 });
  });
});
