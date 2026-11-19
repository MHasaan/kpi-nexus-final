import type { FiscalConfig } from '@kpi-nexus/contracts';

import { type Period, currentPeriod } from './period';

/**
 * Past values pasted onto a KPI, one per line: a date in the period, then the
 * value. A new organisation's first job is entering the months it already has,
 * and the only way used to be one value at a time.
 *
 * Each value is recorded for the whole period its date falls in (by the KPI's
 * frequency and the organisation's calendar), as the one-value form does. A
 * period that already has a value, or comes twice in the list, is not recorded
 * again.
 */
export interface PastValueRow {
  /** The line's number in what was pasted, from 1. */
  line: number;
  /** The line as it was pasted. */
  text: string;
  period: Period | null;
  value: number | null;
  status: 'ready' | 'recorded' | 'repeated' | 'invalid';
  /** What is wrong with an invalid line. */
  problem?: string;
}

const NOT_A_DATE = 'Not a date (write it as 2026-01-31, or 2026-01 for a month)';

/** "2026-01-31", "2026/01/31", "2026-01" (the first of the month) → a UTC day, or null. */
function readDay(cell: string): Date | null {
  const match = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?$/.exec(cell.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 1)];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real ? date : null;
}

/** "42,000", " 39500.5 ", "-4" → a number, or null. A point is the decimal mark; commas group thousands. */
function readValue(cell: string): number | null {
  const cleaned = cell.replace(/[\s,]/g, '');
  if (cleaned === '' || !/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** A line's two cells: split on a tab (a spreadsheet's columns), else a semicolon, else the first comma. */
function cellsOf(line: string): [string, string | undefined] {
  for (const separator of ['\t', ';']) {
    const at = line.indexOf(separator);
    if (at >= 0) return [line.slice(0, at), line.slice(at + 1)];
  }
  const comma = line.indexOf(',');
  return comma >= 0 ? [line.slice(0, comma), line.slice(comma + 1)] : [line, undefined];
}

export function parsePastValues(
  text: string,
  frequency: string,
  existingStarts: ReadonlySet<string>,
  config?: FiscalConfig,
): PastValueRow[] {
  const rows: PastValueRow[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  let firstFilled = true;
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    const [dateCell, valueCell] = cellsOf(line);
    const day = readDay(dateCell);
    const value = valueCell === undefined ? null : readValue(valueCell);
    // A heading row ("Month, Revenue") at the top is left out, not reported.
    const heading = firstFilled && day === null && value === null;
    firstFilled = false;
    if (heading) return;

    const row: PastValueRow = { line: index + 1, text: line, period: null, value, status: 'invalid' };
    if (day === null) row.problem = NOT_A_DATE;
    else if (valueCell === undefined || valueCell.trim() === '') row.problem = 'No value';
    else if (value === null) row.problem = 'Not a number';
    else {
      const period = currentPeriod(frequency, day, config);
      row.period = period;
      row.status = existingStarts.has(period.periodStart) ? 'recorded' : seen.has(period.periodStart) ? 'repeated' : 'ready';
      seen.add(period.periodStart);
    }
    rows.push(row);
  });
  return rows;
}
