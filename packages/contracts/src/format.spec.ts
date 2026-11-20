import { describe, expect, it } from 'vitest';

import { DATE_FORMATS, DEFAULT_FORMAT_SETTINGS, NUMBER_FORMATS, formatCurrency, formatDate, formatDateTime, formatDay, formatNumber, formatSettingsOf, unitForNewKpi } from './format.js';

const base = DEFAULT_FORMAT_SETTINGS;

describe('formatSettingsOf', () => {
  it("reads the organisation's settings and falls back for anything missing or unusable", () => {
    expect(formatSettingsOf({ timezone: 'Asia/Karachi', locale: 'en-GB', currency: 'PKR', dateFormat: 'DD/MM/YYYY', numberFormat: '1.234,56' })).toEqual({
      timezone: 'Asia/Karachi',
      locale: 'en-GB',
      currency: 'PKR',
      dateFormat: 'DD/MM/YYYY',
      numberFormat: '1.234,56',
    });
    expect(formatSettingsOf(null)).toEqual(base);
    expect(formatSettingsOf({ timezone: 'Mars/Olympus', locale: 'not a locale!', currency: 'DOLLARS' })).toEqual(base);
  });

  it('keeps a number format stored as a locale (the old default) working', () => {
    expect(formatSettingsOf({ numberFormat: 'en-US' }).numberFormat).toBe('1,234.56');
    expect(formatSettingsOf({ numberFormat: 'something else' }).numberFormat).toBe('1,234.56');
  });
});

describe('dates', () => {
  const instant = '2026-03-05T22:30:00.000Z';

  it('formats an instant in each of the offered patterns', () => {
    expect(DATE_FORMATS.map((f) => formatDate(instant, { ...base, dateFormat: f }))).toEqual(['2026-03-05', '05/03/2026', '03/05/2026', '5 Mar 2026']);
  });

  it("uses the organisation's timezone: late evening UTC is already the next day in Karachi", () => {
    expect(formatDate(instant, { ...base, timezone: 'Asia/Karachi' })).toBe('2026-03-06');
    expect(formatDateTime(instant, { ...base, timezone: 'Asia/Karachi' })).toBe('2026-03-06 03:30');
    expect(formatDateTime(instant, base)).toBe('2026-03-05 22:30');
  });

  it('a calendar day (a period start or end) is never shifted by the timezone', () => {
    expect(formatDay('2026-03-01', { ...base, timezone: 'America/Los_Angeles', dateFormat: 'DD/MM/YYYY' })).toBe('01/03/2026');
    expect(formatDay('2026-03-01T00:00:00.000Z', { ...base, timezone: 'America/Los_Angeles' })).toBe('2026-03-01');
  });

  it('shows a dash for nothing or for something that is not a date', () => {
    expect(formatDate(null, base)).toBe('—');
    expect(formatDateTime('not a date', base)).toBe('—');
    expect(formatDay(undefined, base)).toBe('—');
  });
});

describe('numbers', () => {
  it('formats in each of the offered styles', () => {
    expect(NUMBER_FORMATS.map((f) => formatNumber(1234567.891, { ...base, numberFormat: f }))).toEqual(['1,234,567.89', '1.234.567,89', '1\u202f234\u202f567,89', '12,34,567.89']);
  });

  it('keeps whole numbers whole, rounds to the digits asked for, and handles negatives and small numbers', () => {
    expect(formatNumber(1200, base)).toBe('1,200');
    expect(formatNumber(0.5, base)).toBe('0.5');
    expect(formatNumber(-9876.5, { ...base, numberFormat: '1.234,56' })).toBe('-9.876,5');
    expect(formatNumber(3.14159, base, { maximumFractionDigits: 3 })).toBe('3.142');
    expect(formatNumber(2, base, { minimumFractionDigits: 2 })).toBe('2.00');
    expect(formatNumber(123456, { ...base, numberFormat: '1,23,456.78' })).toBe('1,23,456');
  });

  it('shows a dash for nothing or for something that is not a number', () => {
    expect(formatNumber(null, base)).toBe('—');
    expect(formatNumber(Number.NaN, base)).toBe('—');
  });

  it("puts the organisation's currency in front of the number", () => {
    expect(formatCurrency(1234.5, base)).toBe('$1,234.50');
    expect(formatCurrency(1234.5, { ...base, currency: 'EUR', numberFormat: '1.234,56' })).toBe('€1.234,50');
  });
});

describe('unitForNewKpi', () => {
  it('gives a percentage KPI with no unit "%"', () => {
    expect(unitForNewKpi('PERCENTAGE', undefined, 'PKR')).toBe('%');
    expect(unitForNewKpi('PERCENTAGE', '  ', null)).toBe('%');
    expect(unitForNewKpi('PERCENTAGE', 'pts', 'PKR')).toBe('pts');
  });

  it("gives a money KPI with no unit the organisation's currency", () => {
    expect(unitForNewKpi('CURRENCY', undefined, 'PKR')).toBe('PKR');
    expect(unitForNewKpi('CURRENCY', '   ', 'pkr')).toBe('PKR');
    expect(unitForNewKpi('CURRENCY', null, 'USD')).toBe('USD');
  });

  it('keeps a unit the person typed', () => {
    expect(unitForNewKpi('CURRENCY', ' USD ', 'PKR')).toBe('USD');
    expect(unitForNewKpi('NUMBER', 'orders', 'PKR')).toBe('orders');
  });

  it('gives no unit to another kind of KPI, or when the currency is unusable', () => {
    expect(unitForNewKpi('COUNT', undefined, 'PKR')).toBeNull();
    expect(unitForNewKpi(undefined, undefined, 'PKR')).toBeNull();
    expect(unitForNewKpi('CURRENCY', undefined, 'rupees')).toBeNull();
    expect(unitForNewKpi('CURRENCY', undefined, null)).toBeNull();
  });
});
