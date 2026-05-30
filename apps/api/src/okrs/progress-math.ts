/**
 * Pure OKR progress math. No I/O — the OkrsService wraps these to persist and
 * roll up. Direction (higher/lower-is-better) is inferred from the baseline →
 * target relationship, so KeyResult needs no separate direction column:
 *
 *   (current - baseline) / (target - baseline)
 *
 * handles BOTH directions: when target < baseline the denominator is negative
 * and a falling `current` yields positive progress. Special cases: no baseline
 * (current / target) and baseline == target (step function at the target).
 */

export interface KeyResultProgressInput {
  baselineValue: number | null;
  targetValue: number;
  currentValue: number | null;
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function keyResultProgress(kr: KeyResultProgressInput, currentValueOverride?: number): number {
  const current = currentValueOverride ?? kr.currentValue;
  if (current === null || current === undefined) return 0;

  const { baselineValue: baseline, targetValue: target } = kr;

  if (baseline === null || baseline === undefined) {
    if (target === 0) return current >= target ? 1 : 0;
    return clamp01(current / target);
  }

  if (baseline === target) {
    return current >= target ? 1 : 0;
  }

  return clamp01((current - baseline) / (target - baseline));
}

export interface KeyResultWeight {
  progress: number;
  weight: number;
}

export interface ChildObjectiveProgress {
  progress: number;
}

/**
 * Weighted average of key results plus child objectives (each child counts with
 * weight 1). When the total weight is zero, fall back to a simple mean so a set
 * of zero-weight KRs still reports meaningful progress.
 */
export function objectiveProgress(
  krs: readonly KeyResultWeight[],
  childObjectives: readonly ChildObjectiveProgress[],
): number {
  const contributions: Array<{ progress: number; weight: number }> = [
    ...krs.map((kr) => ({ progress: kr.progress, weight: kr.weight })),
    ...childObjectives.map((c) => ({ progress: c.progress, weight: 1 })),
  ];

  if (contributions.length === 0) return 0;

  const totalWeight = contributions.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight <= 0) {
    const mean = contributions.reduce((sum, c) => sum + c.progress, 0) / contributions.length;
    return clamp01(mean);
  }

  const weighted = contributions.reduce((sum, c) => sum + c.progress * c.weight, 0) / totalWeight;
  return clamp01(weighted);
}
