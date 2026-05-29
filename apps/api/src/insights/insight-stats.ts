/**
 * Pure window statistics for KPI insight generation. Kept free of Prisma/Nest
 * so the trend math is unit-testable. Returns null when there are too few
 * points to describe a trend (caller skips generating an insight).
 */

export interface WindowStats {
  count: number;
  first: number;
  last: number;
  avg: number;
  min: number;
  max: number;
  /** Percent change from first→last, using |first| as the denominator. */
  changePct: number;
}

export function computeWindowStats(values: number[]): WindowStats | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return null;

  const first = clean[0]!;
  const last = clean[clean.length - 1]!;
  const sum = clean.reduce((a, b) => a + b, 0);
  const changePct =
    first !== 0
      ? ((last - first) / Math.abs(first)) * 100
      : last === 0
        ? 0
        : Math.sign(last) * 100; // zero baseline → ±100, never Infinity

  return {
    count: clean.length,
    first,
    last,
    avg: sum / clean.length,
    min: Math.min(...clean),
    max: Math.max(...clean),
    changePct,
  };
}

/** Sort candidates by |changePct| descending and keep the top N. */
export function rankByAbsChange<T extends { changePct: number }>(items: T[], topN: number): T[] {
  return [...items].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, Math.max(0, topN));
}
