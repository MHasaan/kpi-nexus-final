/**
 * AlertEngineService unit tests. Prisma + Realtime are in-memory fakes.
 * Covers: STATIC_THRESHOLD trigger/no-trigger, cooldown suppression,
 * realtime publish on trigger, and the NO_DATA cron scan.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import type { RealtimeService } from '../realtime/realtime.service.js';
import type { EscalationsService } from '../escalations/escalations.service.js';
import { AlertEngineService } from './alert-engine.service.js';

interface FakeRule {
  id: string;
  organizationId: string;
  kpiId: string;
  name: string;
  ruleType: string;
  config: unknown;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  isActive: boolean;
}

interface FakeAlert {
  id: string;
  organizationId: string;
  alertRuleId: string | null;
  kpiId: string;
  message: string;
  severity: string;
  status: string;
  targetUserId: string | null;
  meta: unknown;
  createdAt: Date;
}

class FakePrisma {
  private n = 1;
  rules: FakeRule[] = [];
  alerts: FakeAlert[] = [];
  dataPoints: { organizationId: string; kpiId: string; recordedAt: Date }[] = [];

  alertRule = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.rules.filter(
        (r) =>
          (where.organizationId === undefined || r.organizationId === where.organizationId) &&
          (where.kpiId === undefined || r.kpiId === where.kpiId) &&
          (where.ruleType === undefined || r.ruleType === where.ruleType) &&
          (where.isActive === undefined || r.isActive === where.isActive),
      ),
    ),
  };

  alert = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const since = (where.createdAt as { gte?: Date } | undefined)?.gte;
      return (
        this.alerts.find(
          (a) =>
            a.organizationId === where.organizationId &&
            a.alertRuleId === where.alertRuleId &&
            a.kpiId === where.kpiId &&
            (since === undefined || a.createdAt >= since),
        ) ?? null
      );
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const a: FakeAlert = {
        id: `alert_${this.n++}`,
        organizationId: data.organizationId as string,
        alertRuleId: (data.alertRuleId as string) ?? null,
        kpiId: data.kpiId as string,
        message: data.message as string,
        severity: data.severity as string,
        status: (data.status as string) ?? 'OPEN',
        targetUserId: (data.targetUserId as string) ?? null,
        meta: data.meta ?? null,
        createdAt: new Date(),
      };
      this.alerts.push(a);
      return {
        id: a.id,
        severity: a.severity,
        kpiId: a.kpiId,
        alertRuleId: a.alertRuleId,
        createdAt: a.createdAt,
      };
    }),
  };

  kPIDataPoint = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const matches = this.dataPoints
        .filter((d) => d.organizationId === where.organizationId && d.kpiId === where.kpiId)
        .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
      return matches[0] ? { recordedAt: matches[0].recordedAt } : null;
    }),
  };
}

function makeEngine(prisma: FakePrisma) {
  const realtime = {
    publish: vi.fn(async (_orgId: string, _event: { type: string }) => {}),
  };
  const escalations = {
    enqueueLevel: vi.fn(async (_a: string, _o: string, _l: number, _d: number) => {}),
  };
  const engine = new AlertEngineService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    escalations as unknown as EscalationsService,
  );
  return { engine, realtime, escalations };
}

const ORG = 'org_1';
const KPI = 'kpi_1';

describe('AlertEngineService.evaluateKpi (STATIC_THRESHOLD)', () => {
  test('creates an Alert + publishes realtime when threshold breached', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'High', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 100 }, severity: 'HIGH', isActive: true,
    });
    const { engine, realtime } = makeEngine(prisma);

    const created = await engine.evaluateKpi({
      organizationId: ORG, kpiId: KPI, value: 150, recordedAt: new Date(),
    });

    expect(created).toHaveLength(1);
    expect(prisma.alerts).toHaveLength(1);
    expect(prisma.alerts[0]!.severity).toBe('HIGH');
    expect(realtime.publish).toHaveBeenCalledOnce();
    const [, event] = realtime.publish.mock.calls[0]!;
    expect((event as { type: string }).type).toBe('alert_triggered');
  });

  test('does not create an Alert when threshold not breached', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'High', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 100 }, severity: 'MEDIUM', isActive: true,
    });
    const { engine, realtime } = makeEngine(prisma);

    const created = await engine.evaluateKpi({
      organizationId: ORG, kpiId: KPI, value: 50, recordedAt: new Date(),
    });

    expect(created).toHaveLength(0);
    expect(prisma.alerts).toHaveLength(0);
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  test('inactive rules are not evaluated', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'Off', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 0 }, severity: 'LOW', isActive: false,
    });
    const { engine } = makeEngine(prisma);
    const created = await engine.evaluateKpi({
      organizationId: ORG, kpiId: KPI, value: 999, recordedAt: new Date(),
    });
    expect(created).toHaveLength(0);
  });

  test('cooldown suppresses a second alert within the window', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'High', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 100, cooldownMinutes: 60 }, severity: 'HIGH', isActive: true,
    });
    const { engine } = makeEngine(prisma);

    const first = await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 150, recordedAt: new Date() });
    const second = await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 160, recordedAt: new Date() });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0); // suppressed
    expect(prisma.alerts).toHaveLength(1);
  });

  test('no cooldown → repeated breaches create repeated alerts', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'High', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 100 }, severity: 'HIGH', isActive: true,
    });
    const { engine } = makeEngine(prisma);
    await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 150, recordedAt: new Date() });
    await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 160, recordedAt: new Date() });
    expect(prisma.alerts).toHaveLength(2);
  });

  test('DYNAMIC_STDDEV is stubbed — never triggers in P4', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'Stddev', ruleType: 'DYNAMIC_STDDEV',
      config: { sigmas: 1, windowSize: 5 }, severity: 'HIGH', isActive: true,
    });
    const { engine } = makeEngine(prisma);
    const created = await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 99999, recordedAt: new Date() });
    expect(created).toHaveLength(0);
  });
});

describe('AlertEngineService.scanNoDataForOrg', () => {
  const now = new Date('2026-05-29T12:00:00.000Z');

  test('triggers when the KPI has no data at all', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_nd', organizationId: ORG, kpiId: KPI, name: 'Stale', ruleType: 'NO_DATA',
      config: { maxStaleMinutes: 60 }, severity: 'MEDIUM', isActive: true,
    });
    const { engine } = makeEngine(prisma);
    const created = await engine.scanNoDataForOrg(ORG, now);
    expect(created).toHaveLength(1);
  });

  test('does not trigger when recent data exists', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_nd', organizationId: ORG, kpiId: KPI, name: 'Stale', ruleType: 'NO_DATA',
      config: { maxStaleMinutes: 60 }, severity: 'MEDIUM', isActive: true,
    });
    prisma.dataPoints.push({ organizationId: ORG, kpiId: KPI, recordedAt: new Date(now.getTime() - 10 * 60_000) });
    const { engine } = makeEngine(prisma);
    const created = await engine.scanNoDataForOrg(ORG, now);
    expect(created).toHaveLength(0);
  });
});
