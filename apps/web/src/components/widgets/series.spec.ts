import { describe, expect, test } from 'vitest';

import type { DataPoint } from '@/lib/api-client';

import { latestPoint, periodLabel, previousPoint, toSeries } from './series';

/** The API returns points newest period first (kpi-data.service orderBy). */
const point = (periodStart: string, value: number, recordedAt = periodStart): DataPoint =>
  ({ periodStart, periodEnd: periodStart, recordedAt, value }) as DataPoint;

const NEWEST_FIRST = [
  point('2026-11-01T00:00:00Z', 498_000),
  point('2026-10-01T00:00:00Z', 485_674),
  point('2026-09-01T00:00:00Z', 477_810),
];

describe('latestPoint (UI-001)', () => {
  test('is the newest period, not the last element of the array', () => {
    expect(latestPoint(NEWEST_FIRST)?.value).toBe(498_000);
  });

  test('works whichever way round the array arrives', () => {
    expect(latestPoint([...NEWEST_FIRST].reverse())?.value).toBe(498_000);
  });

  test('a value entered late for an older period never becomes the latest', () => {
    const backfilled = [...NEWEST_FIRST, point('2025-01-01T00:00:00Z', 1, '2026-12-31T00:00:00Z')];
    expect(latestPoint(backfilled)?.value).toBe(498_000);
  });

  test('two entries for one period: the one entered last wins', () => {
    const corrected = [
      point('2026-11-01T00:00:00Z', 498_000, '2026-11-02T00:00:00Z'),
      point('2026-11-01T00:00:00Z', 500_000, '2026-11-09T00:00:00Z'),
    ];
    expect(latestPoint(corrected)?.value).toBe(500_000);
  });

  test('nothing recorded', () => {
    expect(latestPoint([])).toBeUndefined();
    expect(latestPoint(undefined)).toBeUndefined();
  });
});

describe('previousPoint', () => {
  test('is the period before the latest, for a change indicator', () => {
    expect(previousPoint(NEWEST_FIRST)?.value).toBe(485_674);
  });

  test('a single period has nothing to compare against', () => {
    expect(previousPoint([NEWEST_FIRST[0]!])).toBeUndefined();
  });
});

describe('toSeries', () => {
  test('runs oldest to newest, so time reads left to right', () => {
    expect(toSeries(NEWEST_FIRST).map((p) => p.value)).toEqual([477_810, 485_674, 498_000]);
  });

  test('keeps the last N periods, not the first N', () => {
    expect(toSeries(NEWEST_FIRST, 2).map((p) => p.value)).toEqual([485_674, 498_000]);
  });

  test('never changes the array it was given', () => {
    const input = [...NEWEST_FIRST];
    toSeries(input);
    expect(input).toEqual(NEWEST_FIRST);
  });

  test('empty in, empty out', () => {
    expect(toSeries(undefined)).toEqual([]);
  });
});

describe('periodLabel', () => {
  test('labels a point by the period it measures, not when it was typed in', () => {
    const late = point('2026-10-01T00:00:00Z', 1, '2026-11-09T00:00:00Z');
    expect(periodLabel(late, 'en-GB')).toBe('01/10/2026');
  });
});
