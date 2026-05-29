export interface ThresholdBand {
  name: string;
  lower: number | null;
  upper: number | null;
  color: string;
  order: number;
  consecutivePointsRequired: number;
}

export interface ResolvedStatus {
  band: string | null;
  reason: 'ok' | 'no_bands' | 'no_data' | 'out_of_bands' | 'hysteresis_fallback';
}

/** True when `value` falls inside the band's [lower, upper] (null = open-ended). */
export function valueInBand(value: number, band: ThresholdBand): boolean {
  if (band.lower !== null && value < band.lower) return false;
  if (band.upper !== null && value > band.upper) return false;
  return true;
}

/** The first band (by ascending order) that contains the value, or null. */
function bandOf(value: number, bands: ThresholdBand[]): ThresholdBand | null {
  return bands.find((b) => valueInBand(value, b)) ?? null;
}

/**
 * Resolve a KPI's current status band from recent values (newest first), with
 * hysteresis: the newest value's band only "wins" once it has been held for
 * `consecutivePointsRequired` consecutive points; otherwise we fall back to the
 * previous stable band (the band of the value just before the new run).
 */
export function resolveStatus(
  bands: ThresholdBand[],
  recentValuesNewestFirst: number[],
): ResolvedStatus {
  if (bands.length === 0) return { band: null, reason: 'no_bands' };
  if (recentValuesNewestFirst.length === 0) return { band: null, reason: 'no_data' };

  const ordered = [...bands].sort((a, b) => a.order - b.order);
  const leading = bandOf(recentValuesNewestFirst[0]!, ordered);
  if (!leading) return { band: null, reason: 'out_of_bands' };

  let streak = 0;
  for (const v of recentValuesNewestFirst) {
    if (bandOf(v, ordered)?.name === leading.name) streak++;
    else break;
  }

  if (streak >= leading.consecutivePointsRequired) {
    return { band: leading.name, reason: 'ok' };
  }

  // Hysteresis not yet met — keep the previous stable band if there is one.
  const prev = recentValuesNewestFirst[streak];
  const prevBand = prev !== undefined ? bandOf(prev, ordered) : null;
  return { band: (prevBand ?? leading).name, reason: 'hysteresis_fallback' };
}
