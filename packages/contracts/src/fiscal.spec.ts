import { describe, expect, it } from 'vitest';

import { DEFAULT_FISCAL_CONFIG, currentPeriod, fiscalConfigOf, fiscalQuarterRange, fiscalYearRange, weekRange } from './fiscal.js';

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('fiscalConfigOf', () => {
  it('reads the start month and the week start from the organisation', () => {
    expect(fiscalConfigOf({ fiscalCalendar: { startMonth: 4, other: 'kept elsewhere' }, weekStartsOn: 0 })).toEqual({ startMonth: 4, weekStartsOn: 0 });
  });

  it('falls back to January and Monday for anything missing or out of range', () => {
    expect(fiscalConfigOf(null)).toEqual(DEFAULT_FISCAL_CONFIG);
    expect(fiscalConfigOf({ fiscalCalendar: null })).toEqual({ startMonth: 1, weekStartsOn: 1 });
    expect(fiscalConfigOf({ fiscalCalendar: { startMonth: 13 }, weekStartsOn: 9 })).toEqual({ startMonth: 1, weekStartsOn: 1 });
    expect(fiscalConfigOf({ fiscalCalendar: { startMonth: '4' }, weekStartsOn: 1.5 })).toEqual({ startMonth: 1, weekStartsOn: 1 });
  });
});

describe('weekRange', () => {
  // 2026-11-18 is a Wednesday.
  it('Monday start: Monday to Sunday', () => {
    expect(weekRange(at('2026-11-18'), 1)).toEqual({ periodStart: '2026-11-16', periodEnd: '2026-11-22' });
  });

  it('Sunday start: Sunday to Saturday', () => {
    expect(weekRange(at('2026-11-18'), 0)).toEqual({ periodStart: '2026-11-15', periodEnd: '2026-11-21' });
  });

  it('the first day of the week belongs to the week it starts', () => {
    expect(weekRange(at('2026-11-15'), 0)).toEqual({ periodStart: '2026-11-15', periodEnd: '2026-11-21' });
    expect(weekRange(at('2026-11-15'), 1)).toEqual({ periodStart: '2026-11-09', periodEnd: '2026-11-15' });
  });
});

describe('fiscalYearRange / fiscalQuarterRange', () => {
  it('a January year is the calendar year and its quarters the calendar quarters', () => {
    expect(fiscalYearRange(at('2026-11-18'), 1)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-12-31' });
    expect(fiscalQuarterRange(at('2026-11-18'), 1)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-12-31' });
  });

  it('an April year runs April to March; November is in its third quarter', () => {
    expect(fiscalYearRange(at('2026-11-18'), 4)).toEqual({ periodStart: '2026-04-01', periodEnd: '2027-03-31' });
    expect(fiscalQuarterRange(at('2026-11-18'), 4)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-12-31' });
  });

  it('before the start month, the fiscal year began the year before', () => {
    expect(fiscalYearRange(at('2026-02-10'), 4)).toEqual({ periodStart: '2025-04-01', periodEnd: '2026-03-31' });
    expect(fiscalQuarterRange(at('2026-02-10'), 4)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-03-31' });
  });

  it('a February year has quarters that do not line up with calendar quarters, and handles a leap day', () => {
    expect(fiscalQuarterRange(at('2026-11-18'), 2)).toEqual({ periodStart: '2026-11-01', periodEnd: '2027-01-31' });
    expect(fiscalYearRange(at('2027-06-01'), 3)).toEqual({ periodStart: '2027-03-01', periodEnd: '2028-02-29' });
  });
});

describe('currentPeriod', () => {
  const cfg = { startMonth: 4, weekStartsOn: 0 };
  it("follows the KPI's frequency and the organisation's calendar", () => {
    expect(currentPeriod('WEEKLY', at('2026-11-18'), cfg)).toEqual({ periodStart: '2026-11-15', periodEnd: '2026-11-21' });
    expect(currentPeriod('MONTHLY', at('2026-11-18'), cfg)).toEqual({ periodStart: '2026-11-01', periodEnd: '2026-11-30' });
    expect(currentPeriod('QUARTERLY', at('2026-02-10'), cfg)).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    expect(currentPeriod('YEARLY', at('2026-02-10'), cfg)).toEqual({ periodStart: '2025-04-01', periodEnd: '2026-03-31' });
    expect(currentPeriod('DAILY', at('2026-11-18'), cfg)).toEqual({ periodStart: '2026-11-18', periodEnd: '2026-11-18' });
  });

  it('with no calendar given, it is the calendar year and Monday weeks', () => {
    expect(currentPeriod('WEEKLY', at('2026-11-18'))).toEqual({ periodStart: '2026-11-16', periodEnd: '2026-11-22' });
    expect(currentPeriod('YEARLY', at('2026-11-18'))).toEqual({ periodStart: '2026-01-01', periodEnd: '2026-12-31' });
  });
});
