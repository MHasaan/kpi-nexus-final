import { describe, expect, it } from 'vitest';

import { evaluateNoData } from './no-data.js';

const now = new Date('2026-05-29T12:00:00.000Z');

describe('evaluateNoData', () => {
  it('triggers when no data has ever been recorded', () => {
    const r = evaluateNoData({ maxStaleMinutes: 60 }, null, now);
    expect(r.triggered).toBe(true);
    expect(r.message).toContain('No data ever');
  });

  it('triggers when last data point is older than the staleness window', () => {
    const lastAt = new Date(now.getTime() - 90 * 60_000); // 90m ago
    expect(evaluateNoData({ maxStaleMinutes: 60 }, lastAt, now).triggered).toBe(true);
  });

  it('does not trigger when data is within the window', () => {
    const lastAt = new Date(now.getTime() - 30 * 60_000); // 30m ago
    expect(evaluateNoData({ maxStaleMinutes: 60 }, lastAt, now).triggered).toBe(false);
  });

  it('does not trigger exactly at the boundary (uses strictly-greater)', () => {
    const lastAt = new Date(now.getTime() - 60 * 60_000); // exactly 60m
    expect(evaluateNoData({ maxStaleMinutes: 60 }, lastAt, now).triggered).toBe(false);
  });

  it('triggers just past the boundary', () => {
    const lastAt = new Date(now.getTime() - 60 * 60_000 - 1_000); // 60m + 1s
    expect(evaluateNoData({ maxStaleMinutes: 60 }, lastAt, now).triggered).toBe(true);
  });
});
