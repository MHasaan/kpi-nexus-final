/**
 * Correcting a recorded value (KPIDataPointHistory). Data points were
 * append-only, so a typo could never be fixed. A correction changes the value
 * and / or note with a required reason, keeps the old and new values in
 * KPIDataPointHistory, and re-runs what a new value triggers (audit, live
 * update, alert evaluation, derived recomputes). Only someone who can read the
 * point may correct it: the person who recorded it, or a KPI_EDIT holder.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

const ORG = 'org_1';
type Point = { id: string; organizationId: string; kpiId: string; userId: string | null; orgUnitId: string | null; value: number; note: string | null; recordedById: string | null; sourceType: string; periodStart: Date; periodEnd: Date; recordedAt: Date };

function setup(opts: { capabilities?: string[]; visible?: boolean; pointScope?: object; point?: Partial<Point> } = {}) {
  const point: Point = {
    id: 'p1', organizationId: ORG, kpiId: 'k1', userId: 'me', orgUnitId: null, value: 10, note: 'typo', recordedById: 'me', sourceType: 'MANUAL',
    periodStart: new Date('2026-10-01'), periodEnd: new Date('2026-10-31'), recordedAt: new Date('2026-11-01'), ...opts.point,
  };
  const history: Array<Record<string, unknown>> = [];
  const tx = {
    kPIDataPoint: { update: vi.fn(async ({ data }: { data: Partial<Point> }) => Object.assign(point, data)) },
    kPIDataPointHistory: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { history.push(data); return { id: 'h1', ...data }; }) },
  };
  const prisma = {
    kPI: { findFirst: vi.fn(async () => ({ id: 'k1', name: 'Calls', scope: 'PER_USER', allowNegative: true, categoryId: null })) },
    kPIDataPoint: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.id !== point.id || where.kpiId !== point.kpiId) return null;
        const scope = where.userId as { in: string[] } | undefined;
        return scope && !scope.in.includes(point.userId ?? '') ? null : point;
      }),
      findMany: vi.fn(async () => []),
    },
    kPIDataPointHistory: { findMany: vi.fn(async () => history) },
    kPICascade: { findMany: vi.fn(async () => []) },
    kPIDependency: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const accessContext = {
    isKpiVisible: vi.fn(async () => opts.visible ?? true),
    kpiPointScopeWhere: vi.fn(async () => opts.pointScope ?? { userId: { in: ['me'] } }),
    resolveForCurrentPrincipal: vi.fn(async () => ({ isAdmin: false, capabilities: opts.capabilities ?? ['KPI_DATA_ENTRY'] })),
  };
  const audit = { record: vi.fn(async () => {}) };
  const realtime = { publish: vi.fn(async () => {}) };
  const alertEngine = { enqueueEvaluateKpi: vi.fn(async () => {}) };
  const calcEngine = { enqueueCascadeRollup: vi.fn(async () => {}), enqueueRecompute: vi.fn(async () => {}) };
  const svc = new KpiDataService(prisma as never, audit as never, accessContext as never, realtime as never, alertEngine as never, calcEngine as never);
  return { svc, point, history, tx, prisma, audit, realtime, alertEngine };
}

const as = <T>(userId: string, fn: () => Promise<T>) =>
  RequestContextStore.run({ userId, organizationId: ORG, roleId: 'r', principalType: 'user' }, fn) as Promise<T>;

describe('KpiDataService.correctDataPoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the recorder corrects the value: point updated, history kept with the reason, side effects re-run', async () => {
    const { svc, point, history, audit, realtime, alertEngine } = setup();
    const out = await as('me', () => svc.correctDataPoint('k1', 'p1', { value: 12, reason: 'Typed 10 instead of 12' }));
    expect(out.value).toBe(12);
    expect(point.value).toBe(12);
    expect(history).toEqual([
      expect.objectContaining({ organizationId: ORG, dataPointId: 'p1', kpiId: 'k1', previousValue: 10, newValue: 12, previousNote: 'typo', newNote: 'typo', reason: 'Typed 10 instead of 12', changedById: 'me' }),
    ]);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'KPIDataPoint', entityId: 'p1' }));
    expect(realtime.publish).toHaveBeenCalledWith(ORG, expect.objectContaining({ type: 'data_point_updated', dataPointId: 'p1', value: 12, previousValue: 10, userId: 'me' }));
    expect(alertEngine.enqueueEvaluateKpi).toHaveBeenCalledWith(expect.objectContaining({ kpiId: 'k1', dataPointId: 'p1', value: 12 }));
  });

  it('a note-only correction keeps the value', async () => {
    const { svc, history } = setup();
    await as('me', () => svc.correctDataPoint('k1', 'p1', { note: 'Includes the late batch', reason: 'Clarify' }));
    expect(history[0]).toMatchObject({ previousValue: 10, newValue: 10, previousNote: 'typo', newNote: 'Includes the late batch' });
  });

  it('a KPI_EDIT holder may correct a point someone else recorded; anyone else gets 403', async () => {
    const editor = setup({ point: { recordedById: 'someone' }, capabilities: ['KPI_EDIT'] });
    await expect(as('me', () => editor.svc.correctDataPoint('k1', 'p1', { value: 1, reason: 'Fix' }))).resolves.toMatchObject({ value: 1 });
    const other = setup({ point: { recordedById: 'someone' } });
    await expect(as('me', () => other.svc.correctDataPoint('k1', 'p1', { value: 1, reason: 'Fix' }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(other.history).toHaveLength(0);
  });

  it('a point outside the caller\'s scope, or on a KPI they cannot see, is 404 (no existence leak)', async () => {
    const outOfScope = setup({ point: { userId: 'stranger' } });
    await expect(as('me', () => outOfScope.svc.correctDataPoint('k1', 'p1', { value: 1, reason: 'Fix' }))).rejects.toBeInstanceOf(NotFoundException);
    const hidden = setup({ visible: false });
    await expect(as('me', () => hidden.svc.correctDataPoint('k1', 'p1', { value: 1, reason: 'Fix' }))).rejects.toBeInstanceOf(NotFoundException);
    const otherKpi = setup();
    await expect(as('me', () => otherKpi.svc.correctDataPoint('k1', 'nope', { value: 1, reason: 'Fix' }))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a calculated (COMPUTED) value is recalculated, not corrected: 409', async () => {
    const { svc } = setup({ point: { sourceType: 'COMPUTED' } });
    await expect(as('me', () => svc.correctDataPoint('k1', 'p1', { value: 1, reason: 'Fix' }))).rejects.toBeInstanceOf(ConflictException);
  });

  it('a correction that changes nothing is refused', async () => {
    const { svc } = setup();
    await expect(as('me', () => svc.correctDataPoint('k1', 'p1', { value: 10, reason: 'Same' }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('KpiDataService.dataPointHistory', () => {
  it('returns the corrections of a point the caller can read, newest first', async () => {
    const { svc, prisma } = setup();
    await as('me', () => svc.correctDataPoint('k1', 'p1', { value: 12, reason: 'Fix' }));
    const rows = await as('me', () => svc.dataPointHistory('k1', 'p1'));
    expect(rows).toHaveLength(1);
    expect(prisma.kPIDataPointHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: ORG, dataPointId: 'p1' }, orderBy: { changedAt: 'desc' } }));
  });

  it('a point the caller cannot read has no readable history (404)', async () => {
    const { svc } = setup({ point: { userId: 'stranger' } });
    await expect(as('me', () => svc.dataPointHistory('k1', 'p1'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
