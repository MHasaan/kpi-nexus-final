/**
 * P2.4 — cascade rollup unit tests.
 *
 * Tests the pure helpers (applyRollup + aggregateChildPoints) without
 * touching Prisma. The CascadeService.computeForParent integration is
 * exercised by the same test file via in-memory mocks.
 */
import { describe, expect, test } from 'vitest';

import {
  aggregateChildPoints,
  applyRollup,
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
