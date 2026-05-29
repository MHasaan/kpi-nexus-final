import { describe, expect, it } from 'vitest';

import {
  BENCHMARK_KINDS,
  computeBenchmarkValue,
  isBenchmarkKind,
  resolveCutoff,
} from './benchmark-compute.js';

describe('isBenchmarkKind', () => {
  it('accepts the three canonical kinds', () => {
    expect(BENCHMARK_KINDS).toEqual([
      'INTERNAL_HISTORICAL',
      'EXTERNAL_INDUSTRY',
      'EXTERNAL_PEER',
    ]);
    for (const k of BENCHMARK_KINDS) expect(isBenchmarkKind(k)).toBe(true);
  });

  it('rejects unknown kinds', () => {
    expect(isBenchmarkKind('NOPE')).toBe(false);
    expect(isBenchmarkKind('internal_historical')).toBe(false); // case-sensitive
    expect(isBenchmarkKind('')).toBe(false);
  });
});

describe('resolveCutoff', () => {
  it('subtracts whole days from the reference instant', () => {
    const now = new Date('2026-05-29T12:00:00.000Z');
    expect(resolveCutoff(now, 30).toISOString()).toBe('2026-04-29T12:00:00.000Z');
    expect(resolveCutoff(now, 1).toISOString()).toBe('2026-05-28T12:00:00.000Z');
  });

  it('returns the same instant for a zero-day window', () => {
    const now = new Date('2026-05-29T12:00:00.000Z');
    expect(resolveCutoff(now, 0).getTime()).toBe(now.getTime());
  });
});

describe('computeBenchmarkValue', () => {
  it('returns null for an empty set', () => {
    expect(computeBenchmarkValue([])).toBeNull();
  });

  it('returns the single value for one point', () => {
    expect(computeBenchmarkValue([42])).toBe(42);
  });

  it('averages multiple values', () => {
    expect(computeBenchmarkValue([10, 20, 30])).toBe(20);
    expect(computeBenchmarkValue([1, 2])).toBe(1.5);
  });

  it('handles negative and zero values', () => {
    expect(computeBenchmarkValue([-10, 10])).toBe(0);
    expect(computeBenchmarkValue([0, 0, 0])).toBe(0);
  });
});
