/**
 * Pure OKR progress math. 13 cases: 4 KR shape variants (higher/lower-is-better
 * with baseline, no-baseline, baseline==target), clamping, null-current,
 * weighted objective average, zero-weight fallback, child-objective rollup.
 */
import { describe, expect, test } from 'vitest';

import { clamp01, keyResultProgress, objectiveProgress } from './progress-math.js';

describe('keyResultProgress', () => {
  test('higher-is-better with baseline, halfway → 0.5', () => {
    // baseline 0, target 100, current 50
    expect(keyResultProgress({ baselineValue: 0, targetValue: 100, currentValue: 50 })).toBeCloseTo(0.5);
  });

  test('higher-is-better with baseline, exceeds target → clamped to 1', () => {
    expect(keyResultProgress({ baselineValue: 20, targetValue: 100, currentValue: 140 })).toBe(1);
  });

  test('higher-is-better with baseline, below baseline → clamped to 0', () => {
    expect(keyResultProgress({ baselineValue: 50, targetValue: 100, currentValue: 30 })).toBe(0);
  });

  test('lower-is-better with baseline (target < baseline), halfway → 0.5', () => {
    // baseline 100, target 0, current 50 → halved
    expect(keyResultProgress({ baselineValue: 100, targetValue: 0, currentValue: 50 })).toBeCloseTo(0.5);
  });

  test('lower-is-better with baseline, beats target → clamped to 1', () => {
    expect(keyResultProgress({ baselineValue: 100, targetValue: 20, currentValue: 10 })).toBe(1);
  });

  test('no baseline → current / target', () => {
    expect(keyResultProgress({ baselineValue: null, targetValue: 200, currentValue: 50 })).toBeCloseTo(0.25);
  });

  test('no baseline, exceeds target → clamped to 1', () => {
    expect(keyResultProgress({ baselineValue: null, targetValue: 200, currentValue: 999 })).toBe(1);
  });

  test('baseline == target, current >= target → 1', () => {
    expect(keyResultProgress({ baselineValue: 100, targetValue: 100, currentValue: 100 })).toBe(1);
  });

  test('baseline == target, current < target → 0', () => {
    expect(keyResultProgress({ baselineValue: 100, targetValue: 100, currentValue: 99 })).toBe(0);
  });

  test('null current value → 0 progress', () => {
    expect(keyResultProgress({ baselineValue: 0, targetValue: 100, currentValue: null })).toBe(0);
  });

  test('explicit currentValue argument overrides the KR field', () => {
    expect(keyResultProgress({ baselineValue: 0, targetValue: 100, currentValue: 10 }, 75)).toBeCloseTo(0.75);
  });
});

describe('objectiveProgress', () => {
  test('weighted average of key results', () => {
    // KR1 progress 1.0 weight 3, KR2 progress 0.0 weight 1 → 3/4 = 0.75
    const krs = [
      { progress: 1.0, weight: 3 },
      { progress: 0.0, weight: 1 },
    ];
    expect(objectiveProgress(krs, [])).toBeCloseTo(0.75);
  });

  test('zero total weight → simple mean fallback', () => {
    const krs = [
      { progress: 0.2, weight: 0 },
      { progress: 0.8, weight: 0 },
    ];
    expect(objectiveProgress(krs, [])).toBeCloseTo(0.5);
  });

  test('child objectives roll up with weight 1 alongside KRs', () => {
    // KR progress 1.0 weight 1, child objective progress 0.0 weight 1 → 0.5
    const krs = [{ progress: 1.0, weight: 1 }];
    const children = [{ progress: 0.0 }];
    expect(objectiveProgress(krs, children)).toBeCloseTo(0.5);
  });

  test('no krs and no children → 0', () => {
    expect(objectiveProgress([], [])).toBe(0);
  });
});

describe('clamp01', () => {
  test('clamps below 0 and above 1', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.42)).toBeCloseTo(0.42);
  });
});
