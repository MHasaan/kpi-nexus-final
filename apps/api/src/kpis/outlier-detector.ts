/**
 * Pure streaming outlier detection. Kept free of Prisma/Nest so the statistics
 * can be unit-tested in isolation. Uses Welford's numerically-stable online
 * algorithm to compute the mean and population standard deviation of a KPI's
 * recent history, then flags a candidate value whose z-score meets `sigmas`.
 */

export interface OutlierResult {
  isOutlier: boolean;
  mean: number;
  stddev: number;
  z: number;
}

const NOT_OUTLIER = (mean: number, stddev: number): OutlierResult => ({
  isOutlier: false,
  mean,
  stddev,
  z: 0,
});

/**
 * @param history prior data-point values (most-recent-N is fine); non-finite
 *   entries are ignored.
 * @param value   the candidate value being recorded.
 * @param sigmas  z-score threshold (default 3).
 *
 * Returns isOutlier=false when the candidate is non-finite, history has fewer
 * than 2 usable points, or the history is flat (zero stddev → undefined z).
 */
export function detectOutlier(history: number[], value: number, sigmas = 3): OutlierResult {
  if (!Number.isFinite(value)) return NOT_OUTLIER(NaN, 0);

  const clean = history.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    const mean = clean.length === 1 ? clean[0]! : NaN;
    return NOT_OUTLIER(mean, 0);
  }

  // Welford's online algorithm.
  let count = 0;
  let mean = 0;
  let m2 = 0;
  for (const x of clean) {
    count += 1;
    const delta = x - mean;
    mean += delta / count;
    const delta2 = x - mean;
    m2 += delta * delta2;
  }

  const variance = m2 / count; // population variance
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return NOT_OUTLIER(mean, 0);

  const z = Math.abs(value - mean) / stddev;
  return { isOutlier: z >= sigmas, mean, stddev, z };
}
