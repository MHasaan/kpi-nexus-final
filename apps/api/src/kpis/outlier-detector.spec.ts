import { describe, expect, it } from 'vitest';

import { detectOutlier } from './outlier-detector.js';

// Manual QA (2026-11-19, F-018): a smoothly rising MRR (205,000, 218,000, then 236,500) had its values marked
// "outlier" while the Anomalies page found nothing unusual. The check compared each new value with the mean
// of the older ones, so normal growth looked like a leap, and it did so from two points of history. It now
// follows the trend (a line through the history) and needs six prior values before it says anything.
describe('detectOutlier (a value far from the trend of the history, z >= sigmas)', () => {
  it('does not flag with too-short history (fewer than 6 prior points)', () => {
    expect(detectOutlier([], 100).isOutlier).toBe(false);
    expect(detectOutlier([5], 100).isOutlier).toBe(false);
    expect(detectOutlier([5, 5, 5, 5, 5], 100).isOutlier).toBe(false);
  });

  it('a steady climb is not an outlier: the next step of a trend is expected', () => {
    const mrr = [180_000, 186_000, 193_000, 199_000, 205_000, 211_000, 218_000, 224_000, 230_000];
    expect(detectOutlier(mrr, 236_500).isOutlier).toBe(false);
    expect(detectOutlier(mrr, 236_500).mean).toBeCloseTo(236_300, -3); // the value the trend expects
  });

  it('a leap off the trend is', () => {
    const mrr = [180_000, 186_000, 193_000, 199_000, 205_000, 211_000, 218_000, 224_000, 230_000];
    expect(detectOutlier(mrr, 500_000).isOutlier).toBe(true);
    expect(detectOutlier(mrr, 92_000).isOutlier).toBe(true);
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

  it('flags exactly at the boundary (z === sigmas) and not just inside it', () => {
    const history = [10, 11, 9, 10, 12, 8, 10, 11];
    const base = detectOutlier(history, 10);
    const edge = base.mean + 3 * base.stddev + 1e-9;
    expect(detectOutlier(history, edge, 3).isOutlier).toBe(true);
    expect(detectOutlier(history, edge - 0.01, 3).isOutlier).toBe(false);
  });

  it('does not flag on flat history (zero stddev — cannot determine)', () => {
    const r = detectOutlier([5, 5, 5, 5, 5, 5, 5], 100);
    expect(r.stddev).toBe(0);
    expect(r.isOutlier).toBe(false);
  });

  it('ignores non-finite history values and a non-finite candidate', () => {
    const r = detectOutlier([10, 11, NaN, 9, Infinity, 10, 11, 9, 10], 1000);
    expect(r.isOutlier).toBe(true); // NaN/Infinity filtered from history, outlier still detected
    expect(detectOutlier([10, 11, 9, 10, 11, 9], NaN).isOutlier).toBe(false); // non-finite candidate never flagged
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
