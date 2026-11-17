import { describe, expect, it } from 'vitest';

import { evaluateDynamicStddev } from './dynamic-stddev.js';

// mean 100, population stddev 2
const STEADY = [98, 102, 98, 102, 98, 102];

describe('evaluateDynamicStddev', () => {
  it('triggers on a value far above what is usual', () => {
    const r = evaluateDynamicStddev({ sigmas: 3, windowSize: 6 }, 110, STEADY);
    expect(r.triggered).toBe(true);
    expect(r.message).toBe('Value 110 is 5 standard deviations above the average of the last 6 values (100)');
  });

  it('triggers on a value far below, too', () => {
    const r = evaluateDynamicStddev({ sigmas: 3, windowSize: 6 }, 90, STEADY);
    expect(r.triggered).toBe(true);
    expect(r.message).toContain('below');
  });

  it('does not trigger inside the band, and does at exactly the line', () => {
    expect(evaluateDynamicStddev({ sigmas: 3, windowSize: 6 }, 105, STEADY).triggered).toBe(false);
    expect(evaluateDynamicStddev({ sigmas: 3, windowSize: 6 }, 106, STEADY).triggered).toBe(true);
  });

  it('looks only at the newest windowSize values', () => {
    // The two newest are 98 and 102 (mean 100, stddev 2); the wild older ones are outside the window.
    const history = [98, 102, 5000, -5000];
    expect(evaluateDynamicStddev({ sigmas: 3, windowSize: 2 }, 110, history).triggered).toBe(true);
    expect(evaluateDynamicStddev({ sigmas: 3, windowSize: 4 }, 110, history).triggered).toBe(false);
  });

  it('needs two earlier values, and some spread between them', () => {
    expect(evaluateDynamicStddev({ sigmas: 1, windowSize: 10 }, 999, []).triggered).toBe(false);
    expect(evaluateDynamicStddev({ sigmas: 1, windowSize: 10 }, 999, [100]).triggered).toBe(false);
    expect(evaluateDynamicStddev({ sigmas: 1, windowSize: 10 }, 999, [100, 100, 100]).triggered).toBe(false);
  });
});
