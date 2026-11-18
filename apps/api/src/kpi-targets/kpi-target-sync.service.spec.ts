/**
 * UI-017: targets saved on a KPI's Targets tab were read by nothing — health,
 * dashboards and attainment all use the target on the KPI itself. By the
 * owner's decision (2026-11-18) the target in effect becomes the KPI's target.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { KpiTargetSyncService, targetNumber } from './kpi-target-sync.service.js';

const ORG = 'org_alpha';
const NOW = new Date('2026-06-15T12:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

interface Row {
  id: string;
  organizationId: string;
  kpiId: string;
  type: string;
  value: number | null;
  expectedValue: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
}
const row = (over: Partial<Row>): Row => ({
  id: 't', organizationId: ORG, kpiId: 'kpi_1', type: 'STATIC', value: null, expectedValue: null,
  effectiveFrom: null, effectiveTo: null, createdAt: day('2026-01-01'), ...over,
});

function make(targets: Row[], kpiTarget: number | null = 50) {
  const kpis = [{ id: 'kpi_1', organizationId: ORG, targetValue: kpiTarget }];
  const prisma = {
    kPITarget: {
      findMany: vi.fn(async ({ where }: { where: { kpiId?: string; organizationId?: string } }) =>
        targets.filter((t) => (!where.kpiId || t.kpiId === where.kpiId) && (!where.organizationId || t.organizationId === where.organizationId)),
      ),
    },
    kPI: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; organizationId: string } }) =>
        kpis.find((k) => k.id === where.id && k.organizationId === where.organizationId) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { targetValue: number } }) => {
        Object.assign(kpis.find((k) => k.id === where.id)!, data);
        return {};
      }),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { service: new KpiTargetSyncService(prisma as unknown as PrismaService, audit as unknown as AuditService), prisma, kpis, audit };
}

describe('targetNumber — the one figure a target gives a KPI', () => {
  test('a fixed target gives its value; a tiered one its expected value', () => {
    expect(targetNumber({ type: 'STATIC', value: 100, expectedValue: null })).toBe(100);
    expect(targetNumber({ type: 'TIME_VARYING', value: 120, expectedValue: null })).toBe(120);
    expect(targetNumber({ type: 'TIERED', value: null, expectedValue: 80 })).toBe(80);
  });

  test('a scenario is a what-if and a formula or condition has no single figure: none of them counts', () => {
    expect(targetNumber({ type: 'SCENARIO', value: 999, expectedValue: 999 })).toBeNull();
    expect(targetNumber({ type: 'DYNAMIC', value: null, expectedValue: null })).toBeNull();
    expect(targetNumber({ type: 'CONDITIONAL', value: 10, expectedValue: null })).toBeNull();
    expect(targetNumber({ type: 'STATIC', value: null, expectedValue: null })).toBeNull();
  });
});

describe('KpiTargetSyncService.inEffect — which target counts now', () => {
  test('a dated target that has started outranks an open-ended one; one that has not started or has ended does not count', async () => {
    const { service } = make([
      row({ id: 'open', value: 100 }),
      row({ id: 'started', value: 200, effectiveFrom: day('2026-06-01') }),
      row({ id: 'future', value: 300, effectiveFrom: day('2026-07-01') }),
      row({ id: 'ended', value: 400, effectiveFrom: day('2026-06-10'), effectiveTo: day('2026-06-12') }),
    ]);
    expect((await service.inEffect(ORG, 'kpi_1', NOW))?.id).toBe('started');
    expect((await service.inEffect(ORG, 'kpi_1', day('2026-07-02')))?.id).toBe('future');
    expect((await service.inEffect(ORG, 'kpi_1', day('2026-05-01')))?.id).toBe('open');
  });

  test('between equals the newest wins; a scenario never does', async () => {
    const { service } = make([
      row({ id: 'older', value: 100, createdAt: day('2026-01-01') }),
      row({ id: 'newer', value: 150, createdAt: day('2026-02-01') }),
      row({ id: 'what-if', type: 'SCENARIO', value: 999, expectedValue: 999, createdAt: day('2026-03-01') }),
    ]);
    expect((await service.inEffect(ORG, 'kpi_1', NOW))?.id).toBe('newer');
  });
});

describe('KpiTargetSyncService.syncKpi — the target in effect becomes the KPI\'s target', () => {
  test('the KPI takes the figure of the target in effect, and the change is recorded', async () => {
    const { service, kpis, audit } = make([row({ id: 't1', value: 200 })], 50);
    expect(await service.syncKpi(ORG, 'kpi_1', NOW)).toBe(200);
    expect(kpis[0]!.targetValue).toBe(200);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'KPI', entityId: 'kpi_1', organizationId: ORG }));
  });

  test('already the same: nothing is written', async () => {
    const { service, prisma } = make([row({ id: 't1', value: 50 })], 50);
    await service.syncKpi(ORG, 'kpi_1', NOW);
    expect(prisma.kPI.update).not.toHaveBeenCalled();
  });

  test('with no target in effect the KPI keeps the target it has', async () => {
    const { service, prisma, kpis } = make([row({ id: 'future', value: 300, effectiveFrom: day('2026-07-01') })], 50);
    expect(await service.syncKpi(ORG, 'kpi_1', NOW)).toBeNull();
    expect(prisma.kPI.update).not.toHaveBeenCalled();
    expect(kpis[0]!.targetValue).toBe(50);
  });

  test("another organisation's KPI is not touched", async () => {
    const { service, prisma } = make([row({ id: 't1', value: 200 })], 50);
    expect(await service.syncKpi('org_beta', 'kpi_1', NOW)).toBeNull();
    expect(prisma.kPI.update).not.toHaveBeenCalled();
  });
});

describe('KpiTargetSyncService.syncDue — a target that starts or ends without anyone touching it', () => {
  test('KPIs with a target whose start or end fell in the look-back window are synced; others are left alone', async () => {
    const { service, prisma, kpis } = make([
      row({ id: 'open', value: 100 }),
      row({ id: 'just-started', value: 250, effectiveFrom: new Date('2026-06-15T09:00:00Z') }),
      row({ id: 'other-kpi', kpiId: 'kpi_2', value: 9, effectiveFrom: day('2026-01-01') }),
    ], 100);
    const synced = await service.syncDue(NOW);
    expect(synced).toBe(1);
    expect(kpis[0]!.targetValue).toBe(250);
    expect(prisma.kPI.update).toHaveBeenCalledTimes(1);
  });
});
