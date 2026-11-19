/**
 * Pure progress-status classification for a KPI assignment's current value
 * against its target, direction-aware. Kept free of Prisma/Nest for unit tests.
 */

export type KpiDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_IS_BEST' | 'NEUTRAL';
export type AssignmentStatus = 'exceeded' | 'on_track' | 'at_risk' | 'behind';

export function computeAssignmentStatus(
  value: number | null,
  target: number | null,
  direction: KpiDirection,
): AssignmentStatus | null {
  if (value === null || target === null || !Number.isFinite(value) || !Number.isFinite(target)) {
    return null;
  }

  if (direction === 'HIGHER_IS_BETTER') {
    if (value >= target) return 'exceeded';
    if (target === 0) return 'behind';
    const ratio = value / target;
    if (ratio >= 0.9) return 'on_track';
    if (ratio >= 0.7) return 'at_risk';
    return 'behind';
  }

  if (direction === 'LOWER_IS_BETTER') {
    if (value <= target) return 'exceeded';
    if (target === 0) return 'behind';
    const ratio = value / target;
    if (ratio <= 1.2) return 'on_track';
    if (ratio <= 1.5) return 'at_risk';
    return 'behind';
  }

  // No clear better-direction: a target exists but proximity isn't graded here.
  return 'on_track';
}

/**
 * What a holder of a KPI — a person, or a unit — is measured against, and
 * where they stand: their own target when one was set for them, else the
 * KPI's. A KPI given a target and handed to people used to show each of them
 * no target and no status, because only their own target counted.
 *
 * Worked out from what is stored now, so a target changed on the KPI is
 * reflected at once; the status column on the assignment is not relied on.
 */
export function holderStanding(
  holder: { targetValue: number | null; currentValue: number | null },
  kpi: { targetValue: number | null; direction: string },
): { targetValue: number | null; status: AssignmentStatus | null } {
  const targetValue = holder.targetValue ?? kpi.targetValue ?? null;
  return { targetValue, status: computeAssignmentStatus(holder.currentValue, targetValue, kpi.direction as KpiDirection) };
}
