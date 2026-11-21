/**
 * Pure outlier detection. Kept free of Prisma/Nest so the statistics can be
 * unit-tested in isolation. A least-squares line through a KPI's recent history
 * says what the trend expects next; a candidate value whose distance from that,
 * measured in the history's own scatter about the line, meets `sigmas` is an
 * outlier. (Until 2026-11-21 the candidate was compared with the mean of the
 * history, so a smoothly rising KPI was flagged at every step: F-018.)
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

/** Prior values needed before a verdict: from two, normal growth looked like a leap (F-018). */
export const MIN_HISTORY = 6;

/**
 * @param history prior data-point values, oldest first (most-recent-N is fine);
 *   non-finite entries are ignored.
 * @param value   the candidate value being recorded.
 * @param sigmas  z-score threshold (default 3).
 *
 * A least-squares line through the history says what the trend expects next
 * (`mean`), and how far the history itself strayed from that line is the
 * scale (`stddev`, population). A smoothly rising KPI is then not an outlier
 * at every step, as it was when each value was compared with the mean of the
 * older ones (F-018).
 *
 * Returns isOutlier=false when the candidate is non-finite, history has fewer
 * than MIN_HISTORY usable points, or the history sits exactly on its line
 * (zero stddev → undefined z).
 */
export function detectOutlier(history: number[], value: number, sigmas = 3): OutlierResult {
  if (!Number.isFinite(value)) return NOT_OUTLIER(NaN, 0);

  const clean = history.filter((v) => Number.isFinite(v));
  const n = clean.length;
  if (n < MIN_HISTORY) {
    const mean = n > 0 ? clean.reduce((a, v) => a + v, 0) / n : NaN;
    return NOT_OUTLIER(mean, 0);
  }

  const meanIndex = (n - 1) / 2;
  const meanValue = clean.reduce((a, v) => a + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  clean.forEach((y, i) => {
    sxy += (i - meanIndex) * (y - meanValue);
    sxx += (i - meanIndex) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanValue - slope * meanIndex;
  const expected = intercept + slope * n;

  const residuals = clean.map((y, i) => y - (intercept + slope * i));
  const stddev = Math.sqrt(residuals.reduce((a, r) => a + r * r, 0) / n);
  if (stddev === 0) return NOT_OUTLIER(expected, 0);

  const z = Math.abs(value - expected) / stddev;
  return { isOutlier: z >= sigmas, mean: expected, stddev, z };
}

/**
 * The earlier rule, kept for the "unusual for this KPI" alert, whose window is chosen by the rule and whose
 * meaning is "far from the mean and spread of the last N values": Welford's online mean and population
 * standard deviation over the history, z of the candidate against them. Needs two prior points.
 */
export function detectOutlierFromMean(history: number[], value: number, sigmas = 3): OutlierResult {
  if (!Number.isFinite(value)) return NOT_OUTLIER(NaN, 0);
  const clean = history.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return NOT_OUTLIER(clean.length === 1 ? clean[0]! : NaN, 0);
  let count = 0;
  let mean = 0;
  let m2 = 0;
  for (const x of clean) {
    count += 1;
    const delta = x - mean;
    mean += delta / count;
    m2 += delta * (x - mean);
  }
  const stddev = Math.sqrt(m2 / count);
  if (stddev === 0) return NOT_OUTLIER(mean, 0);
  const z = Math.abs(value - mean) / stddev;
  return { isOutlier: z >= sigmas, mean, stddev, z };
}
