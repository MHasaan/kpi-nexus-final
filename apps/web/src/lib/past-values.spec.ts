import { describe, expect, test } from 'vitest';

import { parsePastValues } from './past-values';

const none = new Set<string>();

describe('parsePastValues', () => {
  test('a date and a value per line, each for the whole period the date falls in', () => {
    const rows = parsePastValues('2026-01-01, 100\n2026-02, 120\n2026-03-15\t130', 'MONTHLY', none);
    expect(rows.map((r) => [r.status, r.period, r.value])).toEqual([
      ['ready', { periodStart: '2026-01-01', periodEnd: '2026-01-31' }, 100],
      ['ready', { periodStart: '2026-02-01', periodEnd: '2026-02-28' }, 120],
      ['ready', { periodStart: '2026-03-01', periodEnd: '2026-03-31' }, 130],
    ]);
  });

  test('two columns pasted from a spreadsheet, with a heading row and thousands separators', () => {
    const rows = parsePastValues('Month\tRevenue\n2026-01\t42,000\n2026-02\t39,500.5', 'MONTHLY', none);
    expect(rows.map((r) => [r.line, r.value])).toEqual([
      [2, 42000],
      [3, 39500.5],
    ]);
  });

  test('a period that already has a value, or comes twice, is not recorded again', () => {
    const rows = parsePastValues('2026-03-10, 1\n2026-04-01, 2\n2026-04-20, 3', 'MONTHLY', new Set(['2026-03-01']));
    expect(rows.map((r) => r.status)).toEqual(['recorded', 'ready', 'repeated']);
  });

  test('a line that is not a date and a number says what is wrong with it', () => {
    const rows = parsePastValues('yesterday, 5\n2026-02-30, 5\n2026-02-01, lots\n2026-02-01', 'MONTHLY', none);
    expect(rows.map((r) => [r.status, r.problem])).toEqual([
      ['invalid', 'Not a date (write it as 2026-01-31, or 2026-01 for a month)'],
      ['invalid', 'Not a date (write it as 2026-01-31, or 2026-01 for a month)'],
      ['invalid', 'Not a number'],
      ['invalid', 'No value'],
    ]);
  });

  test('a weekly KPI follows the organisation’s first day of the week; a daily one is the day itself', () => {
    // 2026-11-18 is a Wednesday.
    expect(parsePastValues('2026-11-18, 7', 'WEEKLY', none, { startMonth: 1, weekStartsOn: 1 })[0]!.period).toEqual({ periodStart: '2026-11-16', periodEnd: '2026-11-22' });
    expect(parsePastValues('2026-11-18, 7', 'WEEKLY', none, { startMonth: 1, weekStartsOn: 0 })[0]!.period).toEqual({ periodStart: '2026-11-15', periodEnd: '2026-11-21' });
    expect(parsePastValues('2026-11-18, 7', 'DAILY', none)[0]!.period).toEqual({ periodStart: '2026-11-18', periodEnd: '2026-11-18' });
  });

  test('blank lines are left out; negative and decimal values are kept as typed', () => {
    const rows = parsePastValues('\n2026-01-01, -4.5\n\n', 'MONTHLY', none);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 2, value: -4.5, status: 'ready' });
  });
});
