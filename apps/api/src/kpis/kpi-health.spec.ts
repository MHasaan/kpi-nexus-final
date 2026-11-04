import { describe, expect, test } from 'vitest';

import { attainmentPct, kpiHealthStatus } from './kpi-health.js';

const meta = (over: Partial<Parameters<typeof kpiHealthStatus>[0]['meta']> = {}) => ({
  direction: 'HIGHER_IS_BETTER',
  targetValue: 100,
  warningThreshold: null,
  criticalThreshold: null,
  ...over,
});
const band = (name: string, lower: number | null, upper: number | null, order: number) => ({
  name, lower, upper, order, color: '#000', consecutivePointsRequired: 1,
});

describe('kpiHealthStatus (FE-001 / BE-027 — one server-side rule for dashboard + board pack)', () => {
  test('no value → NO_DATA; value but no target/bands/thresholds → NO_TARGET', () => {
    expect(kpiHealthStatus({ recentValues: [], meta: meta(), bands: [] })).toBe('NO_DATA');
    expect(kpiHealthStatus({ recentValues: [5], meta: meta({ targetValue: null }), bands: [] })).toBe('NO_TARGET');
  });

  test('higher-is-better grading by target', () => {
    expect(kpiHealthStatus({ recentValues: [120], meta: meta(), bands: [] })).toBe('ON_TRACK');
    expect(kpiHealthStatus({ recentValues: [80], meta: meta(), bands: [] })).toBe('AT_RISK');
    expect(kpiHealthStatus({ recentValues: [40], meta: meta(), bands: [] })).toBe('OFF_TRACK');
  });

  test('lower-is-better: over target is NOT on track (the FE-001 bug: churn 3.5% vs ≤2.5% showed "On track")', () => {
    const lower = meta({ direction: 'LOWER_IS_BETTER', targetValue: 2.5 });
    expect(kpiHealthStatus({ recentValues: [2.0], meta: lower, bands: [] })).toBe('ON_TRACK');
    expect(kpiHealthStatus({ recentValues: [3.5], meta: lower, bands: [] })).toBe('AT_RISK');
    expect(kpiHealthStatus({ recentValues: [5], meta: lower, bands: [] })).toBe('OFF_TRACK');
  });

  test('threshold bands take precedence (band name → status)', () => {
    const bands = [band('On Track', 50, null, 0), band('At Risk', 30, 49.99, 1), band('Off Track', null, 29.99, 2)];
    expect(kpiHealthStatus({ recentValues: [10], meta: meta({ targetValue: 5 }), bands })).toBe('OFF_TRACK');
    expect(kpiHealthStatus({ recentValues: [40], meta: meta({ targetValue: 5 }), bands })).toBe('AT_RISK');
  });

  test('explicit warning/critical thresholds are direction-aware', () => {
    const m = meta({ direction: 'LOWER_IS_BETTER', warningThreshold: 10, criticalThreshold: 20, targetValue: null });
    expect(kpiHealthStatus({ recentValues: [5], meta: m, bands: [] })).toBe('ON_TRACK');
    expect(kpiHealthStatus({ recentValues: [15], meta: m, bands: [] })).toBe('AT_RISK');
    expect(kpiHealthStatus({ recentValues: [25], meta: m, bands: [] })).toBe('OFF_TRACK');
  });
});

describe('attainmentPct (direction-aware)', () => {
  test('higher-is-better: value / target', () => {
    expect(attainmentPct(90, 100, 'HIGHER_IS_BETTER')).toBe(90);
  });
  test('lower-is-better: target / value — being over target lowers attainment (was inflating "Avg attainment")', () => {
    expect(attainmentPct(3.5, 2.5, 'LOWER_IS_BETTER')).toBeCloseTo(71.43, 1);
    expect(attainmentPct(2.0, 2.5, 'LOWER_IS_BETTER')).toBe(125);
  });
  test('null when not computable', () => {
    expect(attainmentPct(null, 100, 'HIGHER_IS_BETTER')).toBeNull();
    expect(attainmentPct(5, null, 'HIGHER_IS_BETTER')).toBeNull();
    expect(attainmentPct(5, 0, 'HIGHER_IS_BETTER')).toBeNull();
    expect(attainmentPct(0, 2.5, 'LOWER_IS_BETTER')).toBeNull();
    expect(attainmentPct(5, 10, 'NEUTRAL')).toBeNull();
  });
});
