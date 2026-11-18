import { describe, expect, it } from 'vitest';

import { presetToRange } from './date-presets';

const now = new Date('2026-11-18T09:00:00.000Z');

describe('presetToRange', () => {
  it('a number of days counts back from today', () => {
    expect(presetToRange('7d', now)).toEqual({ from: '2026-11-11', to: '2026-11-18' });
    expect(presetToRange('1y', now)).toEqual({ from: '2025-11-18', to: '2026-11-18' });
  });

  it("'This quarter' runs from the start of the organisation's fiscal quarter to today (plan 6.4)", () => {
    expect(presetToRange('quarter', now)).toEqual({ from: '2026-10-01', to: '2026-11-18' });
    // A fiscal year starting in February: November opens its fourth quarter.
    expect(presetToRange('quarter', now, { startMonth: 2, weekStartsOn: 1 })).toEqual({ from: '2026-11-01', to: '2026-11-18' });
  });

  it("'This fiscal year' runs from the start of the fiscal year to today", () => {
    expect(presetToRange('fiscal-year', now)).toEqual({ from: '2026-01-01', to: '2026-11-18' });
    expect(presetToRange('fiscal-year', now, { startMonth: 4, weekStartsOn: 1 })).toEqual({ from: '2026-04-01', to: '2026-11-18' });
    expect(presetToRange('fiscal-year', new Date('2026-02-10T00:00:00Z'), { startMonth: 4, weekStartsOn: 1 })).toEqual({ from: '2025-04-01', to: '2026-02-10' });
  });
});
