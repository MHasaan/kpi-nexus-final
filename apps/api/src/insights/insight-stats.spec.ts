import { describe, expect, it } from 'vitest';

import { computeWindowStats, rankByAbsChange } from './insight-stats.js';

describe('computeWindowStats', () => {
  it('returns null for fewer than 2 points (cannot compute a trend)', () => {
    expect(computeWindowStats([])).toBeNull();
    expect(computeWindowStats([5])).toBeNull();
  });

  it('computes first/last/avg/min/max and percent change', () => {
    const s = computeWindowStats([100, 110, 90, 120])!;
    expect(s.count).toBe(4);
    expect(s.first).toBe(100);
    expect(s.last).toBe(120);
    expect(s.min).toBe(90);
    expect(s.max).toBe(120);
    expect(s.avg).toBeCloseTo(105, 6);
    expect(s.changePct).toBeCloseTo(20, 6); // (120-100)/100
  });

  it('handles a negative trend', () => {
    const s = computeWindowStats([200, 150])!;
    expect(s.changePct).toBeCloseTo(-25, 6);
  });

  it('uses |first| as the denominator so a negative baseline keeps the sign of movement', () => {
    const s = computeWindowStats([-50, -25])!; // moved up by 25 from a -50 base
    expect(s.changePct).toBeCloseTo(50, 6); // (−25 − −50)/|−50| = 25/50 = +50%
  });

  it('defines change from a zero baseline as ±100 (avoids Infinity)', () => {
    expect(computeWindowStats([0, 7])!.changePct).toBe(100);
    expect(computeWindowStats([0, -3])!.changePct).toBe(-100);
    expect(computeWindowStats([0, 0])!.changePct).toBe(0);
  });
});

describe('rankByAbsChange', () => {
  const item = (kpiId: string, changePct: number) => ({ kpiId, changePct });

  it('sorts by absolute change descending and caps at topN', () => {
    const ranked = rankByAbsChange(
      [item('a', 5), item('b', -40), item('c', 12), item('d', -3)],
      2,
    );
    expect(ranked.map((r) => r.kpiId)).toEqual(['b', 'c']); // |−40| then |12|
  });

  it('returns all when topN exceeds the list', () => {
    expect(rankByAbsChange([item('a', 5)], 20)).toHaveLength(1);
  });
});
