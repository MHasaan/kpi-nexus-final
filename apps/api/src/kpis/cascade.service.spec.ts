/**
 * P2.4 — cascade rollup unit tests.
 *
 * Tests the pure helpers (applyRollup + aggregateChildPoints) without
 * touching Prisma. The CascadeService.computeForParent integration is
 * exercised by the same test file via in-memory mocks.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  CascadeService,
  type HolderPoint,
  aggregateChildPoints,
  applyRollup,
  childPeriodValue,
  combineForMethod,
  type RollupMethod,
} from './cascade.service.js';

describe('applyRollup', () => {
  test('SUM: 10 + 20 + 30 = 60', () => {
    expect(applyRollup('SUM', { a: 10, b: 20, c: 30 })).toBe(60);
  });

  test('AVG: (10 + 20 + 30) / 3 = 20', () => {
    expect(applyRollup('AVG', { a: 10, b: 20, c: 30 })).toBe(20);
  });

  test('WEIGHTED_AVG with explicit weights', () => {
    // (10*1 + 20*2 + 30*3) / (1 + 2 + 3) = (10 + 40 + 90) / 6 = 140/6
    expect(
      applyRollup('WEIGHTED_AVG', { a: 10, b: 20, c: 30 }, { a: 1, b: 2, c: 3 }),
    ).toBeCloseTo(23.333_333, 5);
  });

  test('WEIGHTED_AVG defaults missing weights to 1', () => {
    // weights default to 1 for every entry → behaves like AVG
    expect(applyRollup('WEIGHTED_AVG', { a: 10, b: 20, c: 30 })).toBe(20);
  });

  test('WEIGHTED_AVG with all weights = 0 → null (avoids div by zero)', () => {
    expect(
      applyRollup('WEIGHTED_AVG', { a: 10, b: 20 }, { a: 0, b: 0 }),
    ).toBeNull();
  });

  test('MIN', () => {
    expect(applyRollup('MIN', { a: 10, b: -3, c: 30 })).toBe(-3);
  });

  test('MAX', () => {
    expect(applyRollup('MAX', { a: 10, b: -3, c: 30 })).toBe(30);
  });

  test('CUSTOM_FORMULA evaluates against child values', () => {
    expect(
      applyRollup(
        'CUSTOM_FORMULA',
        { revenue: 1000, cost: 400 },
        {},
        '(revenue - cost) / revenue * 100',
      ),
    ).toBe(60);
  });

  test('CUSTOM_FORMULA with IF branching', () => {
    expect(
      applyRollup(
        'CUSTOM_FORMULA',
        { actual: 110, target: 100 },
        {},
        'IF(actual >= target, 100, actual / target * 100)',
      ),
    ).toBe(100);
  });

  test('CUSTOM_FORMULA missing customFormula → BadRequest', () => {
    expect(() =>
      applyRollup('CUSTOM_FORMULA', { a: 1 }, {}, undefined),
    ).toThrow(/customFormula/);
  });

  test('empty child set returns null (no children contributed)', () => {
    const methods: RollupMethod[] = ['SUM', 'AVG', 'WEIGHTED_AVG', 'MIN', 'MAX'];
    for (const m of methods) {
      expect(applyRollup(m, {})).toBeNull();
    }
  });

  test('single child returns its own value for SUM/AVG/MIN/MAX', () => {
    expect(applyRollup('SUM', { only: 42 })).toBe(42);
    expect(applyRollup('AVG', { only: 42 })).toBe(42);
    expect(applyRollup('MIN', { only: 42 })).toBe(42);
    expect(applyRollup('MAX', { only: 42 })).toBe(42);
  });

  test('weights for a child that has no value are ignored', () => {
    // child "c" not in childValues, even though weight provided
    expect(applyRollup('WEIGHTED_AVG', { a: 10 }, { a: 2, c: 5 })).toBe(10);
  });
});

describe('aggregateChildPoints', () => {
  const points = [
    { value: 10, periodStart: new Date('2026-01-05') },
    { value: 20, periodStart: new Date('2026-01-15') },
    { value: 30, periodStart: new Date('2026-01-25') },
    { value: 100, periodStart: new Date('2026-02-05') }, // outside window
  ];

  test('SUM within window', () => {
    expect(
      aggregateChildPoints(
        points,
        'SUM',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).toBe(60); // 10 + 20 + 30
  });

  test('AVG within window', () => {
    expect(
      aggregateChildPoints(
        points,
        'AVG',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).toBe(20);
  });

  test('LAST within window picks the latest periodStart', () => {
    expect(
      aggregateChildPoints(
        points,
        'LAST',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).toBe(30);
  });

  test('FIRST within window picks the earliest periodStart', () => {
    expect(
      aggregateChildPoints(
        points,
        'FIRST',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      ),
    ).toBe(10);
  });

  test('empty window returns null', () => {
    expect(
      aggregateChildPoints(
        points,
        'SUM',
        new Date('2026-03-01'),
        new Date('2026-03-31'),
      ),
    ).toBeNull();
  });

  test('window includes only one point', () => {
    expect(
      aggregateChildPoints(
        points,
        'SUM',
        new Date('2026-01-10'),
        new Date('2026-01-20'),
      ),
    ).toBe(20);
  });
});

describe('Real-world cascade scenarios', () => {
  test('Sales: SUM rollup of three regions', () => {
    // Parent: company-wide sales = sum of regions
    const regions = { north: 1000, south: 800, west: 1500 };
    expect(applyRollup('SUM', regions)).toBe(3300);
  });

  test('CSAT: AVG rollup across 4 product lines', () => {
    const csat = { prodA: 80, prodB: 75, prodC: 90, prodD: 85 };
    expect(applyRollup('AVG', csat)).toBe(82.5);
  });

  test('Risk score: WEIGHTED_AVG across 3 categories', () => {
    // operational 50%, financial 30%, regulatory 20%
    const scores = { operational: 60, financial: 80, regulatory: 95 };
    const weights = { operational: 0.5, financial: 0.3, regulatory: 0.2 };
    const got = applyRollup('WEIGHTED_AVG', scores, weights);
    // 60*.5 + 80*.3 + 95*.2 / (.5 + .3 + .2) = (30 + 24 + 19) / 1 = 73
    expect(got).toBeCloseTo(73, 5);
  });

  test('Composite formula: profit margin from revenue + cost children', () => {
    const v = applyRollup(
      'CUSTOM_FORMULA',
      { revenue: 5000, cost: 3000 },
      {},
      'ROUND((revenue - cost) / revenue * 100, 1)',
    );
    expect(v).toBe(40);
  });

  test('Composite formula returning boolean coerces to 1/0', () => {
    const v = applyRollup(
      'CUSTOM_FORMULA',
      { actual: 110, target: 100 },
      {},
      'actual >= target',
    );
    expect(v).toBe(1); // true → 1
    const v2 = applyRollup(
      'CUSTOM_FORMULA',
      { actual: 90, target: 100 },
      {},
      'actual >= target',
    );
    expect(v2).toBe(0); // false → 0
  });
});

// Manual QA (2026-11-19, F-028): "New Bookings", recorded per unit (Enterprise Sales 92,000, SMB Sales 41,000),
// attached to MRR as "the sum of them" wrote 92,000 into MRR — one unit's value stood for the child — and wrote
// it twice. Detaching left both rows, which cannot be corrected. A child recorded by several units or people now
// counts each of their values; a period has one calculated row, replaced on each recompute; and a detach
// recalculates the parent from the children left, or removes its calculated rows when none remain.
const NOV = { start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-30T23:59:59Z') };
const unitPoint = (orgUnitId: string, value: number, day = '2026-11-01'): HolderPoint => ({
  value,
  periodStart: new Date(`${day}T00:00:00Z`),
  orgUnitId,
  userId: null,
});

describe('childPeriodValue — a child recorded by several units or people', () => {
  test('each unit counts once: the sum of them is the sum of every unit', () => {
    const points = [unitPoint('enterprise', 92_000), unitPoint('smb', 41_000)];
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'SUM')).toBe(133_000);
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'AVG')).toBe(66_500);
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'MIN')).toBe(41_000);
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'MAX')).toBe(92_000);
  });

  test("a unit's own points are first collapsed by the child's aggregation", () => {
    // Enterprise recorded twice in the period: LAST takes its newest, then the units are summed.
    const points = [unitPoint('enterprise', 80_000, '2026-11-01'), unitPoint('enterprise', 92_000, '2026-11-15'), unitPoint('smb', 41_000)];
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'SUM')).toBe(133_000);
    expect(childPeriodValue(points, 'SUM', NOV.start, NOV.end, 'SUM')).toBe(213_000);
  });

  test('people are holders too', () => {
    const points: HolderPoint[] = [
      { value: 110, periodStart: NOV.start, orgUnitId: null, userId: 'jake' },
      { value: 82, periodStart: NOV.start, orgUnitId: null, userId: 'maria' },
    ];
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'AVG')).toBe(96);
  });

  test("the child's own organisation-level rows stand for it when it has any", () => {
    // A child that is itself a parent has calculated organisation-level rows: those are its value.
    const points: HolderPoint[] = [
      { value: 133_000, periodStart: NOV.start, orgUnitId: null, userId: null },
      unitPoint('enterprise', 92_000),
      unitPoint('smb', 41_000),
    ];
    expect(childPeriodValue(points, 'LAST', NOV.start, NOV.end, 'SUM')).toBe(133_000);
  });

  test('nothing in the period is null; points outside it are ignored', () => {
    expect(childPeriodValue([], 'LAST', NOV.start, NOV.end, 'SUM')).toBeNull();
    expect(childPeriodValue([unitPoint('enterprise', 1, '2026-10-01')], 'LAST', NOV.start, NOV.end, 'SUM')).toBeNull();
  });
});

describe("combineForMethod — how a child's holders are combined into its one value", () => {
  test('sum, average, min and max apply across the holders too', () => {
    expect(combineForMethod('SUM', 'CURRENCY')).toBe('SUM');
    expect(combineForMethod('AVG', 'PERCENTAGE')).toBe('AVG');
    expect(combineForMethod('MIN', 'NUMBER')).toBe('MIN');
    expect(combineForMethod('MAX', 'NUMBER')).toBe('MAX');
  });

  test('a weighted average or a formula needs one value: amounts add up, levels are averaged', () => {
    for (const method of ['WEIGHTED_AVG', 'CUSTOM_FORMULA'] as const) {
      expect(combineForMethod(method, 'CURRENCY')).toBe('SUM');
      expect(combineForMethod(method, 'COUNT')).toBe('SUM');
      expect(combineForMethod(method, 'NUMBER')).toBe('SUM');
      expect(combineForMethod(method, 'PERCENTAGE')).toBe('AVG');
      expect(combineForMethod(method, 'RATING')).toBe('AVG');
      expect(combineForMethod(method, 'DURATION')).toBe('AVG');
      expect(combineForMethod(method, 'BOOLEAN')).toBe('AVG');
    }
  });
});

const ORG = 'org_alpha';
const inCtx = <T>(fn: () => Promise<T>) =>
  RequestContextStore.run({ userId: 'u1', organizationId: ORG, roleId: null, principalType: 'user' }, fn) as Promise<T>;

interface FakePoint {
  id: string;
  kpiId: string;
  value: number;
  periodStart: Date;
  periodEnd: Date;
  orgUnitId: string | null;
  userId: string | null;
  sourceType: string;
  recordedAt: Date;
}

/** Prisma as the cascade needs it: edges with their child KPI, and data points by KPI. */
class FakePrisma {
  edges: Array<{ parentKpiId: string; childKpiId: string; method: string; weight: number; customFormula: string | null; child: { name: string; aggregationMethod: string; type: string } }> = [];
  points: FakePoint[] = [];
  formulas = new Set<string>();
  private seq = 0;

  kPICascade = {
    findMany: vi.fn(async ({ where }: { where: { parentKpiId: string } }) =>
      this.edges
        .filter((e) => e.parentKpiId === where.parentKpiId)
        .map((e) => ({ ...e, childKpi: { id: e.childKpiId, ...e.child } })),
    ),
    count: vi.fn(async ({ where }: { where: { parentKpiId: string } }) => this.edges.filter((e) => e.parentKpiId === where.parentKpiId).length),
    updateMany: vi.fn(async () => ({ count: 0 })),
  };
  kPIDataPoint = {
    findMany: vi.fn(async ({ where }: { where: { kpiId: string; periodStart?: { gte: Date; lte: Date } } }) =>
      this.points.filter((p) => p.kpiId === where.kpiId && (!where.periodStart || (p.periodStart >= where.periodStart.gte && p.periodStart <= where.periodStart.lte))),
    ),
    findFirst: vi.fn(async ({ where, orderBy }: { where: { kpiId: string; sourceType?: string; periodStart?: Date; orgUnitId?: null; userId?: null }; orderBy?: unknown }) => {
      const rows = this.points
        .filter((p) => p.kpiId === where.kpiId)
        .filter((p) => where.sourceType === undefined || p.sourceType === where.sourceType)
        .filter((p) => where.periodStart === undefined || p.periodStart.getTime() === where.periodStart.getTime())
        .filter((p) => !('orgUnitId' in where) || p.orgUnitId === null)
        .filter((p) => !('userId' in where) || p.userId === null)
        .sort((a, b) => (orderBy ? b.periodStart.getTime() - a.periodStart.getTime() : 0));
      return rows[0] ?? null;
    }),
    create: vi.fn(async ({ data }: { data: Omit<FakePoint, 'id' | 'recordedAt' | 'orgUnitId' | 'userId'> & Partial<Pick<FakePoint, 'orgUnitId' | 'userId'>> }) => {
      const row: FakePoint = { ...data, id: `p${++this.seq}`, recordedAt: new Date(), orgUnitId: data.orgUnitId ?? null, userId: data.userId ?? null };
      this.points.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { recordedAt_id: { id: string } }; data: Partial<FakePoint> }) => {
      const row = this.points.find((p) => p.id === where.recordedAt_id.id)!;
      Object.assign(row, data);
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { kpiId: string; sourceType: string } }) => {
      const before = this.points.length;
      this.points = this.points.filter((p) => !(p.kpiId === where.kpiId && p.sourceType === where.sourceType && p.orgUnitId === null && p.userId === null));
      return { count: before - this.points.length };
    }),
  };
  formulaExpression = {
    findFirst: vi.fn(async ({ where }: { where: { kpiId: string } }) => (this.formulas.has(where.kpiId) ? { id: 'f1' } : null)),
  };

  recorded(kpiId: string, value: number, orgUnitId: string | null, period = NOV): void {
    this.points.push({ id: `p${++this.seq}`, kpiId, value, periodStart: period.start, periodEnd: period.end, orgUnitId, userId: null, sourceType: 'MANUAL', recordedAt: new Date() });
  }
  computed(kpiId: string): FakePoint[] {
    return this.points.filter((p) => p.kpiId === kpiId && p.sourceType === 'COMPUTED');
  }
}

function makeService() {
  const prisma = new FakePrisma();
  return { prisma, service: new CascadeService(prisma as unknown as PrismaService) };
}

describe('CascadeService.computeForParent — a child recorded by several units', () => {
  test('sums every unit of a per-unit child, not one of them', async () => {
    const { prisma, service } = makeService();
    prisma.edges = [{ parentKpiId: 'mrr', childKpiId: 'bookings', method: 'SUM', weight: 1, customFormula: null, child: { name: 'New Bookings', aggregationMethod: 'LAST', type: 'CURRENCY' } }];
    prisma.recorded('bookings', 92_000, 'enterprise');
    prisma.recorded('bookings', 41_000, 'smb');

    const result = await inCtx(() => service.computeForParent('mrr', NOV.start, NOV.end));

    expect(result.value).toBe(133_000);
    expect(result.contributingChildren).toBe(1);
    expect(result.totalDataPoints).toBe(2);
  });

  test("an average across children averages each child's units as well", async () => {
    const { prisma, service } = makeService();
    prisma.edges = [
      { parentKpiId: 'csat', childKpiId: 'team-csat', method: 'AVG', weight: 1, customFormula: null, child: { name: 'Team CSAT', aggregationMethod: 'LAST', type: 'PERCENTAGE' } },
      { parentKpiId: 'csat', childKpiId: 'nps', method: 'AVG', weight: 1, customFormula: null, child: { name: 'NPS', aggregationMethod: 'LAST', type: 'NUMBER' } },
    ];
    prisma.recorded('team-csat', 90, 'support');
    prisma.recorded('team-csat', 94, 'success');
    prisma.recorded('nps', 50, null);

    const result = await inCtx(() => service.computeForParent('csat', NOV.start, NOV.end));

    expect(result.value).toBe(71); // (92 + 50) / 2
  });
});

describe('CascadeService.writeComputedPoint — one calculated row per period', () => {
  test('the first write creates the row, the next ones replace its value', async () => {
    const { prisma, service } = makeService();

    await inCtx(() => service.writeComputedPoint('mrr', NOV.start, NOV.end, 92_000));
    await inCtx(() => service.writeComputedPoint('mrr', NOV.start, NOV.end, 133_000));

    expect(prisma.computed('mrr')).toHaveLength(1);
    expect(prisma.computed('mrr')[0]).toMatchObject({ value: 133_000, orgUnitId: null, userId: null, sourceType: 'COMPUTED' });
    expect(prisma.kPIDataPoint.update).toHaveBeenCalledTimes(1);
  });

  test('a recorded value for the same period is left alone', async () => {
    const { prisma, service } = makeService();
    prisma.recorded('mrr', 236_500, null);

    await inCtx(() => service.writeComputedPoint('mrr', NOV.start, NOV.end, 133_000));

    expect(prisma.points.filter((p) => p.kpiId === 'mrr')).toHaveLength(2);
    expect(prisma.points.find((p) => p.sourceType === 'MANUAL')!.value).toBe(236_500);
  });
});

describe('CascadeService.refreshParent — after a child is detached', () => {
  test('with no children left, the calculated rows are removed', async () => {
    const { prisma, service } = makeService();
    prisma.recorded('mrr', 236_500, null);
    await inCtx(() => service.writeComputedPoint('mrr', NOV.start, NOV.end, 92_000));

    await expect(inCtx(() => service.refreshParent('mrr'))).resolves.toBe('removed');

    expect(prisma.computed('mrr')).toHaveLength(0);
    expect(prisma.points.find((p) => p.sourceType === 'MANUAL')!.value).toBe(236_500);
  });

  test('a formula KPI keeps its calculated rows: the formula owns them', async () => {
    const { prisma, service } = makeService();
    prisma.formulas.add('arr');
    await inCtx(() => service.writeComputedPoint('arr', NOV.start, NOV.end, 2_838_000));

    await expect(inCtx(() => service.refreshParent('arr'))).resolves.toBe('none');

    expect(prisma.computed('arr')).toHaveLength(1);
  });

  test('with children left, the newest calculated period is worked out again', async () => {
    const { prisma, service } = makeService();
    prisma.edges = [{ parentKpiId: 'mrr', childKpiId: 'bookings', method: 'SUM', weight: 1, customFormula: null, child: { name: 'New Bookings', aggregationMethod: 'LAST', type: 'CURRENCY' } }];
    prisma.recorded('bookings', 92_000, 'enterprise');
    await inCtx(() => service.writeComputedPoint('mrr', NOV.start, NOV.end, 133_000)); // the detached child's 41,000 is gone

    await expect(inCtx(() => service.refreshParent('mrr'))).resolves.toBe('recomputed');

    expect(prisma.computed('mrr')).toHaveLength(1);
    expect(prisma.computed('mrr')[0]!.value).toBe(92_000);
  });

  test('nothing calculated yet means nothing to do', async () => {
    const { prisma, service } = makeService();
    prisma.edges = [{ parentKpiId: 'mrr', childKpiId: 'bookings', method: 'SUM', weight: 1, customFormula: null, child: { name: 'New Bookings', aggregationMethod: 'LAST', type: 'CURRENCY' } }];

    await expect(inCtx(() => service.refreshParent('mrr'))).resolves.toBe('none');
  });
});
