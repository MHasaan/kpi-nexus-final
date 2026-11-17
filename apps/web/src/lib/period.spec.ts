import { describe, expect, test } from 'vitest';

import { currentPeriod, periodLabel } from './period';

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
