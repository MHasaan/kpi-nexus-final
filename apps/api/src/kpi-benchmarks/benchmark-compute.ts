/**
 * Pure helpers for KPI benchmark computation. Kept free of Prisma/Nest so the
 * arithmetic and windowing can be unit-tested in isolation.
 */

/** Valid benchmark kinds. INTERNAL_HISTORICAL is computed; EXTERNAL_* are manual. */
export const BENCHMARK_KINDS = [
  'INTERNAL_HISTORICAL',
  'EXTERNAL_INDUSTRY',
  'EXTERNAL_PEER',
] as const;
export type BenchmarkKind = (typeof BENCHMARK_KINDS)[number];

export function isBenchmarkKind(value: string): value is BenchmarkKind {
  return (BENCHMARK_KINDS as readonly string[]).includes(value);
}

/**
 * The lower bound of the lookback window: `now` minus `days` whole days.
 * Data points recorded at or after this instant are included in the average.
 */
export function resolveCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Arithmetic mean of the supplied data-point values. Returns null for an empty
 * set so callers can decide whether that is an error (no data to benchmark).
 */
export function computeBenchmarkValue(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return sum / values.length;
}
