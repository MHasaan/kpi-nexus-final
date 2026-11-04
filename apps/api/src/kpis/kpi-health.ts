/**
 * One server-side rule for "is this KPI healthy?", shared by the dashboard
 * summary and the board pack so web and API never disagree (FE-001, BE-027).
 * Pure — no Prisma/Nest.
 *
 * Most specific rule first:
 *   1. configured threshold bands (KPIThresholdBand, with hysteresis);
 *   2. explicit KPI.warningThreshold / criticalThreshold;
 *   3. direction-aware target grading (same as KPI assignments);
 *   4. otherwise NO_TARGET (or NO_DATA when there is no value).
 */
import { type ThresholdBand, resolveStatus } from '../kpi-threshold-bands/threshold-resolver.js';
import { type KpiDirection, computeAssignmentStatus } from '../user-kpis/assignment-status.js';

export type KpiHealthStatus = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NO_TARGET' | 'NO_DATA';

export interface KpiHealthMeta {
  direction: string;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

export function kpiHealthStatus(input: {
  /** Newest first; [0] is the current value. */
  recentValues: number[];
  meta: KpiHealthMeta;
  bands: ThresholdBand[];
}): KpiHealthStatus {
  const { recentValues, meta, bands } = input;
  const value = recentValues[0];
  if (value === undefined) return 'NO_DATA';

  if (bands.length > 0) {
    const resolved = resolveStatus(bands, recentValues);
    if (resolved.band) return statusFromBandName(resolved.band);
  }

  if (meta.warningThreshold !== null || meta.criticalThreshold !== null) {
    const t = thresholdStatus(value, meta);
    if (t) return t;
  }

  const graded = computeAssignmentStatus(value, meta.targetValue, meta.direction as KpiDirection);
  if (graded === 'exceeded' || graded === 'on_track') return 'ON_TRACK';
  if (graded === 'at_risk') return 'AT_RISK';
  if (graded === 'behind') return 'OFF_TRACK';
  return 'NO_TARGET';
}

/**
 * Percent of target achieved, direction-aware: higher-is-better = value/target,
 * lower-is-better = target/value (over target ⇒ below 100%). Null when not
 * meaningful (missing values, zero divisor, or no better-direction).
 */
export function attainmentPct(value: number | null, target: number | null, direction: string): number | null {
  if (value === null || target === null) return null;
  if (direction === 'HIGHER_IS_BETTER') return target === 0 ? null : (value / target) * 100;
  if (direction === 'LOWER_IS_BETTER') return value === 0 ? null : (target / value) * 100;
  return null;
}

/** Map a threshold-band name ("On Track", "At Risk", "Off Track", "Critical", …) to a status. */
function statusFromBandName(name: string): KpiHealthStatus {
  const n = name.toLowerCase();
  if (/off|crit|red|behind|fail/.test(n)) return 'OFF_TRACK';
  if (/risk|warn|amber|watch/.test(n)) return 'AT_RISK';
  return 'ON_TRACK';
}

/** KPI.warningThreshold / criticalThreshold, direction-aware. */
function thresholdStatus(value: number, meta: KpiHealthMeta): KpiHealthStatus | null {
  const { warningThreshold: warning, criticalThreshold: critical, direction, targetValue: target } = meta;
  if (direction === 'HIGHER_IS_BETTER') {
    if (critical !== null && value <= critical) return 'OFF_TRACK';
    if (warning !== null && value <= warning) return 'AT_RISK';
    return 'ON_TRACK';
  }
  if (direction === 'LOWER_IS_BETTER') {
    if (critical !== null && value >= critical) return 'OFF_TRACK';
    if (warning !== null && value >= warning) return 'AT_RISK';
    return 'ON_TRACK';
  }
  if (target !== null) {
    const deviation = Math.abs(value - target) / (Math.abs(target) || 1);
    if (critical !== null && deviation >= critical) return 'OFF_TRACK';
    if (warning !== null && deviation >= warning) return 'AT_RISK';
    return 'ON_TRACK';
  }
  return null;
}
