import { describe, expect, it } from 'vitest';

import { evaluateRateOfChange } from './rate-of-change.js';

describe('evaluateRateOfChange', () => {
  it('a positive pctChange triggers on a rise of that much or more', () => {
    const r = evaluateRateOfChange({ pctChange: 20, windowMinutes: 60 }, 125, 100);
    expect(r.triggered).toBe(true);
    expect(r.message).toBe('Value rose 25% (from 100 to 125) within 1 hour');
    expect(evaluateRateOfChange({ pctChange: 20, windowMinutes: 60 }, 120, 100).triggered).toBe(true);
    expect(evaluateRateOfChange({ pctChange: 20, windowMinutes: 60 }, 119, 100).triggered).toBe(false);
  });

  it('a rise rule ignores a fall, however large', () => {
    expect(evaluateRateOfChange({ pctChange: 20, windowMinutes: 60 }, 10, 100).triggered).toBe(false);
  });

  it('a negative pctChange triggers on a fall of that much or more', () => {
    const r = evaluateRateOfChange({ pctChange: -10, windowMinutes: 1440 }, 85, 100);
    expect(r.triggered).toBe(true);
    expect(r.message).toBe('Value fell 15% (from 100 to 85) within 1 day');
    expect(evaluateRateOfChange({ pctChange: -10, windowMinutes: 1440 }, 95, 100).triggered).toBe(false);
    expect(evaluateRateOfChange({ pctChange: -10, windowMinutes: 1440 }, 300, 100).triggered).toBe(false);
  });

  it('measures against the size of a negative baseline', () => {
    // -100 → -50 is a rise of 50%.
    expect(evaluateRateOfChange({ pctChange: 40, windowMinutes: 5 }, -50, -100).triggered).toBe(true);
    expect(evaluateRateOfChange({ pctChange: -40, windowMinutes: 5 }, -50, -100).triggered).toBe(false);
  });

  it('never triggers without a baseline, from zero, or with no direction', () => {
    expect(evaluateRateOfChange({ pctChange: 20, windowMinutes: 60 }, 500, null).triggered).toBe(false);
    expect(evaluateRateOfChange({ pctChange: 20, windowMinutes: 60 }, 500, 0).triggered).toBe(false);
    expect(evaluateRateOfChange({ pctChange: 0, windowMinutes: 60 }, 500, 100).triggered).toBe(false);
  });

  it('words the window in the largest whole unit', () => {
    expect(evaluateRateOfChange({ pctChange: 1, windowMinutes: 45 }, 200, 100).message).toContain('within 45 minutes');
    expect(evaluateRateOfChange({ pctChange: 1, windowMinutes: 120 }, 200, 100).message).toContain('within 2 hours');
    expect(evaluateRateOfChange({ pctChange: 1, windowMinutes: 4320 }, 200, 100).message).toContain('within 3 days');
  });
});
