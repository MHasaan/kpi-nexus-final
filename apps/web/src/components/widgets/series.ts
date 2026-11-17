import type { DataPoint } from '@/lib/api-client';

/**
 * Reading a KPI's points for display.
 *
 * `GET /kpis/:id/data` returns them NEWEST PERIOD FIRST. Widgets used to take
 * `.at(-1)` as the latest value, which is the OLDEST point in the window, and
 * plotted the array as given, so charts ran right to left (UI-001).
 *
 * "Latest" means the newest period — never the newest entry — so a value typed
 * in late for an old period cannot become the KPI's current value. This matches
 * the API's own ordering (`periodStart desc`, then `recordedAt desc`).
 */

const byPeriodThenEntry = (a: DataPoint, b: DataPoint): number => {
  const period = a.periodStart.localeCompare(b.periodStart);
  return period !== 0 ? period : a.recordedAt.localeCompare(b.recordedAt);
};

/** The points oldest period first. Never mutates the input. */
export function toSeries(points: readonly DataPoint[] | undefined, lastN?: number): DataPoint[] {
  const sorted = [...(points ?? [])].sort(byPeriodThenEntry);
  return lastN === undefined ? sorted : sorted.slice(-lastN);
}

/** The value for the newest period (ties broken by which was entered last). */
export function latestPoint(points: readonly DataPoint[] | undefined): DataPoint | undefined {
  return toSeries(points).at(-1);
}

/** The period before the latest, for a change indicator. */
export function previousPoint(points: readonly DataPoint[] | undefined): DataPoint | undefined {
  return toSeries(points).at(-2);
}

/** A chart label for a point: the period it measures, not when it was entered. */
export function periodLabel(point: DataPoint, locale?: string): string {
  return new Date(point.periodStart).toLocaleDateString(locale);
}
