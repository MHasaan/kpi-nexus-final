import { describe, expect, it } from 'vitest';

import { resolveStatus, valueInBand, type ThresholdBand } from './threshold-resolver.js';

const band = (over: Partial<ThresholdBand>): ThresholdBand => ({
  name: 'b',
  lower: null,
  upper: null,
  color: '#000',
  order: 0,
  consecutivePointsRequired: 1,
  ...over,
});

// HIGHER_IS_BETTER-style bands: critical (low) / warning / good (high)
const BANDS: ThresholdBand[] = [
  band({ name: 'critical', lower: null, upper: 50, order: 0 }),
  band({ name: 'warning', lower: 50, upper: 80, order: 1 }),
  band({ name: 'good', lower: 80, upper: null, order: 2 }),
];

describe('valueInBand', () => {
  it('respects open-ended bounds', () => {
    expect(valueInBand(10, band({ lower: null, upper: 50 }))).toBe(true);
    expect(valueInBand(60, band({ lower: null, upper: 50 }))).toBe(false);
    expect(valueInBand(90, band({ lower: 80, upper: null }))).toBe(true);
  });
});

describe('resolveStatus', () => {
  it('no bands → no_bands', () => {
    expect(resolveStatus([], [10])).toEqual({ band: null, reason: 'no_bands' });
  });

  it('no data → no_data', () => {
    expect(resolveStatus(BANDS, [])).toEqual({ band: null, reason: 'no_data' });
  });

  it('single value picks the open-ended lower band', () => {
    expect(resolveStatus(BANDS, [10])).toEqual({ band: 'critical', reason: 'ok' });
  });

  it('single value picks the open-ended upper band', () => {
    expect(resolveStatus(BANDS, [95])).toEqual({ band: 'good', reason: 'ok' });
  });

  it('picks the correct middle band (non-overlapping ranges)', () => {
    expect(resolveStatus(BANDS, [65]).band).toBe('warning');
  });

  it('value outside all bands → out_of_bands', () => {
    const finiteBands = [band({ name: 'mid', lower: 0, upper: 10, order: 0 })];
    expect(resolveStatus(finiteBands, [50])).toEqual({ band: null, reason: 'out_of_bands' });
  });

  it('hysteresis: N=3 but only 2 consecutive in new band → falls back to previous band', () => {
    const hb = [
      band({ name: 'good', lower: 80, upper: null, order: 1, consecutivePointsRequired: 3 }),
      band({ name: 'warning', lower: 50, upper: 80, order: 0, consecutivePointsRequired: 1 }),
    ];
    // newest first: two 'good' then 'warning' → good streak (2) < 3 → fallback to warning
    const r = resolveStatus(hb, [85, 82, 70, 60]);
    expect(r.band).toBe('warning');
    expect(r.reason).toBe('hysteresis_fallback');
  });

  it('hysteresis: N=3 with 3 consecutive in new band → flips', () => {
    const hb = [
      band({ name: 'good', lower: 80, upper: null, order: 1, consecutivePointsRequired: 3 }),
      band({ name: 'warning', lower: 50, upper: 80, order: 0 }),
    ];
    expect(resolveStatus(hb, [85, 82, 81, 70]).band).toBe('good');
  });

  it('N=1 flips immediately', () => {
    expect(resolveStatus(BANDS, [90, 10, 10]).band).toBe('good');
  });
});
