import { describe, expect, it } from 'vitest';

import { detectOutlier } from './outlier-detector.js';

describe('detectOutlier (Welford streaming mean/stddev, z >= sigmas)', () => {
  it('does not flag with too-short history (< 2 prior points)', () => {
    expect(detectOutlier([], 100).isOutlier).toBe(false);
    expect(detectOutlier([5], 100).isOutlier).toBe(false);
  });

  it('does not flag a value within the normal range', () => {
    const history = [10, 11, 9, 10, 12, 8, 10, 11];
    const r = detectOutlier(history, 10);
    expect(r.isOutlier).toBe(false);
  });

  it('flags a clear positive outlier', () => {
    const history = [10, 11, 9, 10, 12, 8, 10, 11];
    const r = detectOutlier(history, 1000);
    expect(r.isOutlier).toBe(true);
    expect(r.z).toBeGreaterThanOrEqual(3);
  });

  it('flags a clear negative outlier', () => {
    const history = [10, 11, 9, 10, 12, 8, 10, 11];
    expect(detectOutlier(history, -1000).isOutlier).toBe(true);
  });

  it('flags exactly at the 3σ boundary (z === sigmas)', () => {
    // mean 0, population-style stddev 2 over [-2, 2] (n=2): mean 0, variance ((−2)²+2²)/2=4, stddev 2.
    // value 6 → z = 6/2 = 3 → flagged (>=).
    const r = detectOutlier([-2, 2], 6, 3);
    expect(r.mean).toBeCloseTo(0, 9);
    expect(r.stddev).toBeCloseTo(2, 9);
    expect(r.z).toBeCloseTo(3, 9);
    expect(r.isOutlier).toBe(true);
  });

  it('does not flag just inside the boundary', () => {
    const r = detectOutlier([-2, 2], 5.9, 3);
    expect(r.isOutlier).toBe(false);
  });

  it('does not flag on flat history (zero stddev — cannot determine)', () => {
    const r = detectOutlier([5, 5, 5, 5], 100);
    expect(r.stddev).toBe(0);
    expect(r.isOutlier).toBe(false);
  });

  it('ignores non-finite history values and a non-finite candidate', () => {
    const r = detectOutlier([10, 11, NaN, 9, Infinity, 10], 1000);
    expect(r.isOutlier).toBe(true); // NaN/Infinity filtered from history, outlier still detected
    expect(detectOutlier([10, 11, 9], NaN).isOutlier).toBe(false); // non-finite candidate never flagged
  });

  it('honors a custom sigmas override', () => {
    const history = [10, 11, 9, 10, 12, 8, 10, 11];
    // A value that is ~2.5σ out: flagged at sigmas=2, not at sigmas=3.
    const value = detectOutlier(history, 10 + 2.5 * detectOutlier(history, 10).stddev, 3).isOutlier;
    expect(value).toBe(false);
    const value2 = detectOutlier(history, 10 + 2.5 * detectOutlier(history, 10).stddev, 2).isOutlier;
    expect(value2).toBe(true);
  });
});
