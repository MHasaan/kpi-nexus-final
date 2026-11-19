/**
 * The words a report file prints (plan 6.1): dates and numbers follow the
 * organisation's settings, like the pages do.
 */
import { DEFAULT_FORMAT_SETTINGS } from '@kpi-nexus/contracts';
import { describe, expect, test } from 'vitest';

import { attainmentText, generatedLine, latestValueLine, statusCountsLine, statusLabel, summaryRow, targetLine } from './report-text.js';

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

// QA-M10: the PDF's first page was a title and "Total KPIs: 37", and a KPI's section gave
// its latest value and nothing to judge it by — no target, no status, no attainment.
describe('what a KPI is measured against', () => {
  test("the target is written the organisation's way, with the unit; none is said", () => {
    expect(targetLine({ targetValue: 1234.5, unit: 'USD' }, karachi)).toBe('Target: 1.234,5 USD');
    expect(targetLine({ targetValue: null, unit: 'USD' }, karachi)).toBe('Target: none set');
    expect(targetLine({ unit: null }, undefined)).toBe('Target: none set');
  });

  test('attainment is a whole percentage of the target, or a dash when there is nothing to compare', () => {
    expect(attainmentText(92.4)).toBe('92% of target');
    expect(attainmentText(130)).toBe('130% of target');
    expect(attainmentText(null)).toBe('—');
    expect(attainmentText(undefined)).toBe('—');
  });

  test('a status is said in words', () => {
    expect(statusLabel('ON_TRACK')).toBe('On track');
    expect(statusLabel('AT_RISK')).toBe('At risk');
    expect(statusLabel('OFF_TRACK')).toBe('Off track');
    expect(statusLabel('NO_TARGET')).toBe('No target');
    expect(statusLabel('NO_DATA')).toBe('No data');
    expect(statusLabel(undefined)).toBe('—');
  });
});

describe('the summary on the first page', () => {
  const kpis = [
    { name: 'Revenue', unit: 'USD', latestValue: 920, targetValue: 1000, attainmentPct: 92, status: 'AT_RISK' as const },
    { name: 'Churn', unit: '%', latestValue: 2, targetValue: 5, attainmentPct: 100, status: 'ON_TRACK' as const },
    { name: 'NPS', unit: null, latestValue: null, targetValue: null, attainmentPct: null, status: 'NO_DATA' as const },
  ];

  test('one row per KPI: name, latest value, target, attainment, status', () => {
    expect(summaryRow(kpis[0]!, undefined)).toEqual(['Revenue', '920 USD', '1,000 USD', '92%', 'At risk']);
    expect(summaryRow(kpis[2]!, undefined)).toEqual(['NPS', 'No data', '—', '—', 'No data']);
  });

  test('one line counts the KPIs by status, leaving out the statuses nobody has', () => {
    expect(statusCountsLine(kpis)).toBe('3 KPIs: 1 on track, 1 at risk, 1 with no data');
    expect(statusCountsLine([kpis[1]!])).toBe('1 KPI: 1 on track');
    expect(statusCountsLine([])).toBe('No KPIs');
  });
});

// UI-018: in a report a per-person or per-unit KPI reads as a count of holders on track.
describe('a KPI with several holders', () => {
  const calls = { name: 'Calls', unit: null, latestValue: null, scope: 'PER_USER', holders: { total: 2, withValue: 2, withTarget: 2, onTrack: 1 }, status: 'AT_RISK' as const };

  test('its line and its summary row say how many are on track, not "No data"', () => {
    expect(latestValueLine(calls, undefined)).toBe('1 of 2 people on track');
    expect(summaryRow(calls, undefined)).toEqual(['Calls', '1 of 2 people on track', '—', '—', 'At risk']);
  });
});
