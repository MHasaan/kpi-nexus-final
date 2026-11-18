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
  /** KPI names by id; a KPI not listed here cannot be found (its alert is still raised). */
  kpiNames: Record<string, string> = {};
  kPI = {
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) => (this.kpiNames[where.id] ? { name: this.kpiNames[where.id] } : null)),
  };
  dataPoints: {
    organizationId: string;
    kpiId: string;
    recordedAt: Date;
    id?: string;
    value?: number;
    periodStart?: Date;
    orgUnitId?: string | null;
    userId?: string | null;
  }[] = [];

  /** The subset of Prisma's where the engine uses on data points. */
  private matching(where: Record<string, unknown>) {
    const id = where.id as string | { not?: string } | undefined;
    const before = (where.recordedAt as { lte?: Date } | undefined)?.lte;
    return this.dataPoints.filter(
      (d) =>
        d.organizationId === where.organizationId &&
        d.kpiId === where.kpiId &&
        (id === undefined || (typeof id === 'string' ? d.id === id : d.id !== id.not)) &&
        (!('orgUnitId' in where) || (d.orgUnitId ?? null) === where.orgUnitId) &&
        (!('userId' in where) || (d.userId ?? null) === where.userId) &&
        (before === undefined || d.recordedAt <= before),
    );
  }

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
      const newest = this.matching(where).sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
      return newest
        ? { recordedAt: newest.recordedAt, value: newest.value, orgUnitId: newest.orgUnitId ?? null, userId: newest.userId ?? null }
        : null;
    }),
    findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
      this.matching(where)
        .sort((a, b) => (b.periodStart?.getTime() ?? 0) - (a.periodStart?.getTime() ?? 0))
        .slice(0, take)
        .map((d) => ({ value: d.value })),
    ),
  };
}

function makeEngine(prisma: FakePrisma) {
  const realtime = {
    publish: vi.fn(async (_orgId: string, _event: { type: string }) => {}),
  };
  const escalations = {
    enqueueLevel: vi.fn(async (_a: string, _o: string, _l: number, _d: number) => {}),
  };
  const watches = { enqueue: vi.fn(async (_job: unknown) => {}) };
  const engine = new AlertEngineService(
    prisma as unknown as PrismaService,
    realtime as unknown as RealtimeService,
    escalations as unknown as EscalationsService,
    watches as never,
  );
  return { engine, realtime, escalations, watches };
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

  // Flow walk, 2026-11-18: an alert did not say which KPI it was about — in the inbox, the bell,
  // an email or a chat message, "Value 38000 < threshold 45000" could be any of them.
  test("an alert's message begins with the KPI's name", async () => {
    const prisma = new FakePrisma();
    prisma.kpiNames[KPI] = 'Monthly revenue';
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'Floor', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '<', value: 45000 }, severity: 'HIGH', isActive: true,
    });
    const { engine, realtime } = makeEngine(prisma);
    await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 38000, recordedAt: new Date() });
    expect(prisma.alerts[0]!.message).toBe('Monthly revenue: Value 38,000 is below 45,000');
    expect((realtime.publish.mock.calls[0]![1] as unknown as { message: string }).message).toBe('Monthly revenue: Value 38,000 is below 45,000');
  });

  test('a KPI whose name cannot be read still raises its alert, unnamed', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'High', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 100 }, severity: 'HIGH', isActive: true,
    });
    const { engine } = makeEngine(prisma);
    await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 150, recordedAt: new Date() });
    expect(prisma.alerts[0]!.message).toBe('Value 150 is above 100');
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

describe('AlertEngineService → KPI watchers', () => {
  test('a fired rule alert tells the KPI\'s watchers (threshold_breached), a suppressed one does not', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push({
      id: 'rule_1', organizationId: ORG, kpiId: KPI, name: 'High', ruleType: 'STATIC_THRESHOLD',
      config: { operator: '>', value: 100 }, severity: 'HIGH', isActive: true,
    });
    const { engine, watches } = makeEngine(prisma);
    await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 150, recordedAt: new Date() });
    expect(watches.enqueue).toHaveBeenCalledWith({ organizationId: ORG, kpiId: KPI, event: 'threshold_breached', actorUserId: null });
    watches.enqueue.mockClear();
    await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 50, recordedAt: new Date() });
    expect(watches.enqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// UI-009: these three types were accepted, saved and listed — and never fired.
// ---------------------------------------------------------------------------
const NOW = new Date('2026-11-17T12:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

function rule(id: string, ruleType: string, config: unknown): FakeRule {
  return { id, organizationId: ORG, kpiId: KPI, name: id, ruleType, config, severity: 'MEDIUM', isActive: true };
}

/** Earlier monthly values of one series, oldest first, plus the one just recorded. */
function seed(prisma: FakePrisma, earlier: number[], latest: number, series: { orgUnitId?: string; userId?: string } = {}) {
  earlier.forEach((value, i) => {
    prisma.dataPoints.push({
      id: `dp_${series.orgUnitId ?? series.userId ?? 'org'}_${i}`,
      organizationId: ORG,
      kpiId: KPI,
      value,
      periodStart: new Date(Date.UTC(2026, i, 1)),
      recordedAt: minutesAgo((earlier.length - i) * 1440),
      ...series,
    });
  });
  const id = `dp_${series.orgUnitId ?? series.userId ?? 'org'}_new`;
  prisma.dataPoints.push({ id, organizationId: ORG, kpiId: KPI, value: latest, periodStart: new Date(Date.UTC(2026, earlier.length, 1)), recordedAt: NOW, ...series });
  return id;
}

describe('AlertEngineService.evaluateKpi (DYNAMIC_STDDEV)', () => {
  test('fires on a value far from what is usual, leaving the new value out of "usual"', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('unusual', 'DYNAMIC_STDDEV', { sigmas: 3, windowSize: 6 }));
    const dataPointId = seed(prisma, [98, 102, 98, 102, 98, 102], 110);
    const { engine } = makeEngine(prisma);

    const created = await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 110, recordedAt: NOW, dataPointId });

    expect(created).toHaveLength(1);
    expect(prisma.alerts[0]!.message).toBe('Value 110 is 5 standard deviations above the average of the last 6 values (100)');
  });

  test('stays quiet for an ordinary value, and with too little history', async () => {
    const steady = new FakePrisma();
    steady.rules.push(rule('unusual', 'DYNAMIC_STDDEV', { sigmas: 3, windowSize: 6 }));
    const id = seed(steady, [98, 102, 98, 102, 98, 102], 101);
    expect(await makeEngine(steady).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 101, recordedAt: NOW, dataPointId: id })).toHaveLength(0);

    const young = new FakePrisma();
    young.rules.push(rule('unusual', 'DYNAMIC_STDDEV', { sigmas: 1, windowSize: 6 }));
    const first = seed(young, [100], 5000);
    expect(await makeEngine(young).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 5000, recordedAt: NOW, dataPointId: first })).toHaveLength(0);
  });

  test("one unit's value is judged against that unit's history, not another's", async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('unusual', 'DYNAMIC_STDDEV', { sigmas: 3, windowSize: 6 }));
    seed(prisma, [9000, 9100, 9000, 9100, 9000, 9100], 9050, { orgUnitId: 'big' });
    const dataPointId = seed(prisma, [98, 102, 98, 102, 98, 102], 101, { orgUnitId: 'small' });
    const { engine } = makeEngine(prisma);

    // 101 is ordinary for the small unit; against everything mixed together it would not be judged fairly either way.
    expect(await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 101, recordedAt: NOW, dataPointId })).toHaveLength(0);
    // …and 9050 arriving for the small unit is wildly unusual for it, though ordinary for the big one.
    prisma.dataPoints.find((d) => d.id === dataPointId)!.value = 9050;
    expect(await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 9050, recordedAt: NOW, dataPointId })).toHaveLength(1);
  });
});

describe('AlertEngineService.evaluateKpi (RATE_OF_CHANGE)', () => {
  test('fires when the value has fallen far enough since the window began', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('drop', 'RATE_OF_CHANGE', { pctChange: -20, windowMinutes: 1440 }));
    const dataPointId = seed(prisma, [100, 100], 70); // recorded 2 days and 1 day ago
    const { engine } = makeEngine(prisma);

    const created = await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 70, recordedAt: NOW, dataPointId });

    expect(created).toHaveLength(1);
    expect(prisma.alerts[0]!.message).toBe('Value fell 30% (from 100 to 70) within 1 day');
  });

  test('stays quiet when nothing was recorded that long ago, or the move is too small', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('drop', 'RATE_OF_CHANGE', { pctChange: -20, windowMinutes: 10080 })); // a week; history is 2 days deep
    const dataPointId = seed(prisma, [100, 100], 10);
    expect(await makeEngine(prisma).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 10, recordedAt: NOW, dataPointId })).toHaveLength(0);

    const small = new FakePrisma();
    small.rules.push(rule('drop', 'RATE_OF_CHANGE', { pctChange: -20, windowMinutes: 1440 }));
    const id = seed(small, [100, 100], 90);
    expect(await makeEngine(small).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 90, recordedAt: NOW, dataPointId: id })).toHaveLength(0);
  });
});

describe('AlertEngineService.evaluateKpi (COMPOSITE)', () => {
  const parts = [
    { ruleType: 'STATIC_THRESHOLD', config: { operator: '<', value: 80 } },
    { ruleType: 'RATE_OF_CHANGE', config: { pctChange: -20, windowMinutes: 1440 } },
  ];

  test('AND fires only when every part holds', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('both', 'COMPOSITE', { operator: 'AND', rules: parts }));
    const dataPointId = seed(prisma, [100, 100], 70);
    const { engine } = makeEngine(prisma);
    expect(await engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 70, recordedAt: NOW, dataPointId })).toHaveLength(1);
    expect(prisma.alerts[0]!.message).toBe('Value 70 is below 80 and Value fell 30% (from 100 to 70) within 1 day');

    const half = new FakePrisma();
    half.rules.push(rule('both', 'COMPOSITE', { operator: 'AND', rules: parts }));
    const id = seed(half, [75, 75], 70); // under 80, but hardly moved
    expect(await makeEngine(half).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 70, recordedAt: NOW, dataPointId: id })).toHaveLength(0);
  });

  test('OR fires when any part holds', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('either', 'COMPOSITE', { operator: 'OR', rules: parts }));
    const dataPointId = seed(prisma, [75, 75], 70);
    expect(await makeEngine(prisma).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 70, recordedAt: NOW, dataPointId })).toHaveLength(1);
  });
});

describe('AlertEngineService.evaluateKpi (what it loads)', () => {
  test('threshold rules alone read no history', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('high', 'STATIC_THRESHOLD', { operator: '>', value: 100 }));
    await makeEngine(prisma).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 150, recordedAt: NOW, dataPointId: 'x' });
    expect(prisma.kPIDataPoint.findMany).not.toHaveBeenCalled();
    expect(prisma.kPIDataPoint.findFirst).not.toHaveBeenCalled();
  });

  test('history is read once however many rules want it', async () => {
    const prisma = new FakePrisma();
    prisma.rules.push(rule('a', 'DYNAMIC_STDDEV', { sigmas: 3, windowSize: 4 }), rule('b', 'DYNAMIC_STDDEV', { sigmas: 2, windowSize: 6 }));
    const dataPointId = seed(prisma, [98, 102, 98, 102, 98, 102], 101);
    await makeEngine(prisma).engine.evaluateKpi({ organizationId: ORG, kpiId: KPI, value: 101, recordedAt: NOW, dataPointId });
    expect(prisma.kPIDataPoint.findMany).toHaveBeenCalledOnce();
    expect(prisma.kPIDataPoint.findMany.mock.calls[0]![0].take).toBe(6);
  });
});
