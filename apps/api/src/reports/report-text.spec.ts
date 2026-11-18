/**
 * The words a report file prints (plan 6.1): dates and numbers follow the
 * organisation's settings, like the pages do.
 */
import { DEFAULT_FORMAT_SETTINGS } from '@kpi-nexus/contracts';
import { describe, expect, test } from 'vitest';

import { generatedLine, latestValueLine } from './report-text.js';

const karachi = { ...DEFAULT_FORMAT_SETTINGS, timezone: 'Asia/Karachi', dateFormat: 'DD/MM/YYYY' as const, numberFormat: '1.234,56' as const };

describe('generatedLine', () => {
  test("says when the report was made, in the organisation's timezone and date format, and names the timezone", () => {
    expect(generatedLine(new Date('2026-03-05T22:30:00.000Z'), karachi)).toBe('Generated: 06/03/2026 03:30 (Asia/Karachi)');
  });

  test('with no settings: UTC, year first', () => {
    expect(generatedLine(new Date('2026-03-05T22:30:00.000Z'), undefined)).toBe('Generated: 2026-03-05 22:30 (UTC)');
  });
});

describe('latestValueLine', () => {
  test("writes the number the organisation's way, with its unit", () => {
    expect(latestValueLine({ latestValue: 1234567.5, unit: 'USD' }, karachi)).toBe('Latest value: 1.234.567,5 USD');
    expect(latestValueLine({ latestValue: 42, unit: null }, undefined)).toBe('Latest value: 42');
  });

  test('says when there is no value', () => {
    expect(latestValueLine({ latestValue: null, unit: '%' }, karachi)).toBe('Latest value: No data');
  });
});
