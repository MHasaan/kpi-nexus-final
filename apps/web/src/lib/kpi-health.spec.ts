import { describe, expect, test } from 'vitest';

import type { BoardPackMover, DashboardSummaryRow } from './api-client';

import { changeTone, isOnTarget, onTargetTally } from './kpi-health';

const row = (over: Partial<DashboardSummaryRow>): DashboardSummaryRow =>
  ({
    kpiId: 'k',
    name: 'KPI',
    scope: 'ORG_WIDE',
    unit: null,
    targetValue: 100,
    latestValue: 90,
    latestRecordedAt: null,
    aggregatedValue: null,
    pointCount: 1,
    scorecardQuadrant: null,
    direction: 'HIGHER_IS_BETTER',
    status: 'ON_TRACK',
    attainmentPct: null,
    ...over,
  }) as DashboardSummaryRow;

describe('isOnTarget (X-08)', () => {
  test('a lower-is-better KPI under its target is on track, not off', () => {
    // Churn 3.5% against a 4% ceiling: `latest >= target` called this "off target".
    expect(isOnTarget(row({ direction: 'LOWER_IS_BETTER', latestValue: 3.5, targetValue: 4, status: 'ON_TRACK' }))).toBe(true);
  });

  test('a lower-is-better KPI over its target is off track', () => {
    expect(isOnTarget(row({ direction: 'LOWER_IS_BETTER', latestValue: 5, targetValue: 4, status: 'OFF_TRACK' }))).toBe(false);
  });

  test('higher-is-better behaves as before', () => {
    expect(isOnTarget(row({ latestValue: 120, status: 'ON_TRACK' }))).toBe(true);
    expect(isOnTarget(row({ latestValue: 20, status: 'OFF_TRACK' }))).toBe(false);
  });

  test('at risk counts as not on target', () => {
    expect(isOnTarget(row({ status: 'AT_RISK' }))).toBe(false);
  });

  test('without a target or a value there is nothing to compare', () => {
    expect(isOnTarget(row({ status: 'NO_TARGET', targetValue: null }))).toBeNull();
    expect(isOnTarget(row({ status: 'NO_DATA', latestValue: null }))).toBeNull();
  });
});

describe('onTargetTally', () => {
  test('counts only the rows that can be compared', () => {
    expect(
      onTargetTally([
        row({ status: 'ON_TRACK' }),
        row({ status: 'OFF_TRACK' }),
        row({ status: 'NO_DATA' }),
        row({ status: 'NO_TARGET' }),
      ]),
    ).toEqual({ onTarget: 1, comparable: 2 });
  });
});

const mover = (over: Partial<BoardPackMover>): BoardPackMover =>
  ({ kpiId: 'k', name: 'KPI', unit: null, previousValue: 10, currentValue: 12, change: 2, changePct: 20, direction: 'HIGHER_IS_BETTER', ...over }) as BoardPackMover;

describe('changeTone (X-08)', () => {
  test('a fall in a lower-is-better KPI is good news', () => {
    expect(changeTone(mover({ direction: 'LOWER_IS_BETTER', change: -2, changePct: -20 }))).toBe('good');
  });

  test('a rise in a lower-is-better KPI is bad news', () => {
    expect(changeTone(mover({ direction: 'LOWER_IS_BETTER', change: 2, changePct: 20 }))).toBe('bad');
  });

  test('higher-is-better reads the usual way round', () => {
    expect(changeTone(mover({ change: 2 }))).toBe('good');
    expect(changeTone(mover({ change: -2, changePct: -20 }))).toBe('bad');
  });

  test('no direction, no judgement', () => {
    expect(changeTone(mover({ direction: 'NEUTRAL' }))).toBe('flat');
    expect(changeTone(mover({ direction: 'TARGET_IS_BEST' }))).toBe('flat');
  });

  test('no change, or nothing to compare', () => {
    expect(changeTone(mover({ change: 0, changePct: 0 }))).toBe('flat');
    expect(changeTone(mover({ change: null, changePct: null }))).toBe('flat');
  });
});
