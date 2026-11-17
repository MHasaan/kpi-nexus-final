import { describe, expect, test } from 'vitest';

import {
  MONTH_OPTIONS,
  SIZE_TIER_OPTIONS,
  WEEK_START_OPTIONS,
  currencyOptions,
  localeOptions,
  timeZoneOptions,
} from './org-options';

describe('organisation options', () => {
  test('sizes are the four the organisation can store', () => {
    expect(SIZE_TIER_OPTIONS.map((o) => o.value)).toEqual(['SMALL', 'MEDIUM', 'LARGE', 'ENTERPRISE']);
  });

  test('months are 1–12, January first', () => {
    expect(MONTH_OPTIONS).toHaveLength(12);
    expect(MONTH_OPTIONS[0]).toEqual({ value: 1, label: 'January' });
    expect(MONTH_OPTIONS[6]).toEqual({ value: 7, label: 'July' });
  });

  test('a week starts on Monday, Sunday or Saturday, as stored (0 = Sunday)', () => {
    expect(WEEK_START_OPTIONS.map((o) => [o.value, o.label])).toEqual([[1, 'Monday'], [0, 'Sunday'], [6, 'Saturday']]);
  });

  test('time zones start with UTC and are real zones', () => {
    const zones = timeZoneOptions();
    expect(zones[0]!.value).toBe('UTC');
    expect(zones.filter((z) => z.value === 'UTC')).toHaveLength(1);
    expect(zones.some((z) => z.value === 'Asia/Karachi')).toBe(true);
    expect(zones.find((z) => z.value === 'America/New_York')!.label).toBe('America/New York');
  });

  test('currencies are codes with their names', () => {
    const currencies = currencyOptions();
    expect(currencies[0]!.value).toBe('USD');
    expect(currencies.find((c) => c.value === 'PKR')!.label).toMatch(/^PKR — .*Rupee/);
  });

  test('a value already set but not on the list stays selectable', () => {
    expect(timeZoneOptions('Mars/Olympus')[0]).toEqual({ value: 'Mars/Olympus', label: 'Mars/Olympus' });
    expect(currencyOptions('xof')[0]!.value).toBe('XOF');
    expect(localeOptions('sw-KE')[0]).toEqual({ value: 'sw-KE', label: 'sw-KE' });
    expect(localeOptions('en-GB').filter((l) => l.value === 'en-GB')).toHaveLength(1);
  });
});
