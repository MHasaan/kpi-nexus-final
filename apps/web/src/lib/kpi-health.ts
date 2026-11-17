import type { BoardPackMover, DashboardSummaryRow } from './api-client';

/**
 * Reading a KPI's health on the client.
 *
 * Whether a KPI is doing well depends on its direction: 3.5% churn against a
 * 4% ceiling is good, 3.5% against a 3% ceiling is not. Pages used to compare
 * `latestValue >= targetValue`, which marks every lower-is-better KPI that is
 * comfortably under its target as "off target" (X-08).
 *
 * The API already computes a direction-aware `status` (bands → thresholds →
 * target, in apps/api/src/kpis/kpi-health.ts). The client reads that instead of
 * guessing again.
 */

/** True on target, false off it, null when there is nothing to compare. */
export function isOnTarget(row: DashboardSummaryRow): boolean | null {
  if (row.status === 'NO_DATA' || row.status === 'NO_TARGET') return null;
  return row.status === 'ON_TRACK';
}

/** How many comparable rows there are, and how many of those are on target. */
export function onTargetTally(rows: readonly DashboardSummaryRow[]): { onTarget: number; comparable: number } {
  let onTarget = 0;
  let comparable = 0;
  for (const row of rows) {
    const result = isOnTarget(row);
    if (result === null) continue;
    comparable += 1;
    if (result) onTarget += 1;
  }
  return { onTarget, comparable };
}

/** Whether a move is good news, bad news, or neither — given the KPI's direction. */
export function changeTone(mover: BoardPackMover): 'good' | 'bad' | 'flat' {
  const change = mover.change;
  if (change === null || change === 0) return 'flat';
  if (mover.direction === 'HIGHER_IS_BETTER') return change > 0 ? 'good' : 'bad';
  if (mover.direction === 'LOWER_IS_BETTER') return change < 0 ? 'good' : 'bad';
  // TARGET_IS_BEST and NEUTRAL: a move in either direction is not itself good or bad.
  return 'flat';
}
