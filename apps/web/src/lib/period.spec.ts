import { describe, expect, test } from 'vitest';

import { currentPeriod, periodFromStart, periodLabel } from './period';

const at = (iso: string) => new Date(iso);

describe('currentPeriod (2.7)', () => {
  test('a monthly KPI defaults to this calendar month', () => {
    expect(currentPeriod('MONTHLY', at('2026-11-17T09:30:00Z'))).toEqual({
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
    });
  });

  test('a daily KPI defaults to today', () => {
    expect(currentPeriod('DAILY', at('2026-11-17T09:30:00Z'))).toEqual({
      periodStart: '2026-11-17',
      periodEnd: '2026-11-17',
    });
  });

  test('a weekly KPI runs Monday to Sunday', () => {
    // 2026-11-17 is a Tuesday.
    expect(currentPeriod('WEEKLY', at('2026-11-17T09:30:00Z'))).toEqual({
      periodStart: '2026-11-16',
      periodEnd: '2026-11-22',
    });
  });

  test('a quarterly KPI covers its three months', () => {
    expect(currentPeriod('QUARTERLY', at('2026-11-17T09:30:00Z'))).toEqual({
      periodStart: '2026-10-01',
      periodEnd: '2026-12-31',
    });
  });

  test('a yearly KPI covers the calendar year', () => {
    expect(currentPeriod('YEARLY', at('2026-11-17T09:30:00Z'))).toEqual({
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
  });

  test('February in a leap year ends on the 29th', () => {
    expect(currentPeriod('MONTHLY', at('2028-02-10T00:00:00Z')).periodEnd).toBe('2028-02-29');
  });

  test('a frequency with no natural period falls back to today', () => {
    for (const frequency of ['AD_HOC', 'CUSTOM', 'REAL_TIME', 'BIWEEKLY', '']) {
      const period = currentPeriod(frequency, at('2026-11-17T09:30:00Z'));
      expect(period.periodStart, frequency).toBe('2026-11-17');
      expect(period.periodEnd, frequency).toBe('2026-11-17');
    }
  });
});

describe('periodLabel', () => {
  test('one day reads as that day', () => {
    expect(periodLabel({ periodStart: '2026-11-17', periodEnd: '2026-11-17' }, 'en-GB')).toBe('17/11/2026');
  });

  test('a range reads as both ends', () => {
    expect(periodLabel({ periodStart: '2026-11-01', periodEnd: '2026-11-30' }, 'en-GB')).toBe('01/11/2026 – 30/11/2026');
  });

  test('an unset period says so rather than showing Invalid Date', () => {
    expect(periodLabel({ periodStart: '', periodEnd: '' })).toBe('—');
  });
});

describe('periodFromStart (flow walk: recording an earlier month)', () => {
  const november = { periodStart: '2026-11-01', periodEnd: '2026-11-30' };

  test('a monthly KPI moved to October ends at the end of October', () => {
    expect(periodFromStart('MONTHLY', '2026-10-01', november, false)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  });

  test('a start in the middle of a month still ends with that month', () => {
    expect(periodFromStart('MONTHLY', '2026-02-10', november, false)).toEqual({ periodStart: '2026-02-10', periodEnd: '2026-02-28' });
  });

  test('a quarterly KPI follows the organisation’s financial year', () => {
    // A financial year starting in July: 1 October opens its second quarter, which ends on 31 December.
    expect(periodFromStart('QUARTERLY', '2026-10-01', november, false, { startMonth: 7, weekStartsOn: 1 })).toEqual({
      periodStart: '2026-10-01',
      periodEnd: '2026-12-31',
    });
  });

  test('a daily or ad hoc KPI covers the one day', () => {
    expect(periodFromStart('DAILY', '2026-10-05', { periodStart: '2026-11-19', periodEnd: '2026-11-19' }, false)).toEqual({ periodStart: '2026-10-05', periodEnd: '2026-10-05' });
    expect(periodFromStart('AD_HOC', '2026-10-05', { periodStart: '2026-11-19', periodEnd: '2026-11-19' }, false).periodEnd).toBe('2026-10-05');
  });

  test('an end the person chose themself is kept', () => {
    expect(periodFromStart('MONTHLY', '2026-10-01', { periodStart: '2026-11-01', periodEnd: '2026-11-15' }, true)).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-11-15' });
  });

  test('a start that is not a date yet changes nothing else', () => {
    expect(periodFromStart('MONTHLY', '', november, false)).toEqual({ periodStart: '', periodEnd: '2026-11-30' });
  });
});
