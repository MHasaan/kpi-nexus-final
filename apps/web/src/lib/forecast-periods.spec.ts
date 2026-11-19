/**
 * Flow walk (forecast): the table's rows were "t+1", "t+2" under a "Date"
 * heading. Each row is the period after the last recorded one, by the KPI's
 * frequency — a real date.
 */
import { describe, expect, test } from 'vitest';

import { forecastPeriodStart } from './forecast-periods';

describe('forecastPeriodStart', () => {
  test('monthly: the first of each following month, across a year end', () => {
    expect(forecastPeriodStart('2026-11-01', 'MONTHLY', 1)).toBe('2026-12-01');
    expect(forecastPeriodStart('2026-11-01', 'MONTHLY', 2)).toBe('2027-01-01');
    expect(forecastPeriodStart('2026-11-01T00:00:00.000Z', 'MONTHLY', 14)).toBe('2028-01-01');
  });
  test('daily, weekly, quarterly and yearly', () => {
    expect(forecastPeriodStart('2026-12-31', 'DAILY', 1)).toBe('2027-01-01');
    expect(forecastPeriodStart('2026-11-02', 'WEEKLY', 2)).toBe('2026-11-16');
    expect(forecastPeriodStart('2026-10-01', 'QUARTERLY', 1)).toBe('2027-01-01');
    expect(forecastPeriodStart('2026-01-01', 'YEARLY', 3)).toBe('2029-01-01');
  });
  test('nothing to count from, or a frequency it does not know: no date is made up', () => {
    expect(forecastPeriodStart(null, 'MONTHLY', 1)).toBeNull();
    expect(forecastPeriodStart('not a date', 'MONTHLY', 1)).toBeNull();
    expect(forecastPeriodStart('2026-11-01', 'FORTNIGHTLY', 1)).toBeNull();
  });
});
