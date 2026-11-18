import type { DataPoint, KpiSummary } from '@/lib/api-client';

/** What a widget reads from a data point. The public share page has only these. */
export type SeriesPoint = Pick<DataPoint, 'value' | 'periodStart' | 'recordedAt'>;

/** What a widget reads from its KPI. */
export type WidgetKpi = Pick<KpiSummary, 'name' | 'unit' | 'targetValue' | 'warningThreshold' | 'criticalThreshold'>;

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

const byPeriodThenEntry = (a: SeriesPoint, b: SeriesPoint): number => {
  const period = a.periodStart.localeCompare(b.periodStart);
  return period !== 0 ? period : a.recordedAt.localeCompare(b.recordedAt);
};

/** The points oldest period first. Never mutates the input. */
export function toSeries<T extends SeriesPoint>(points: readonly T[] | undefined, lastN?: number): T[] {
  const sorted = [...(points ?? [])].sort(byPeriodThenEntry);
  return lastN === undefined ? sorted : sorted.slice(-lastN);
}

/** The value for the newest period (ties broken by which was entered last). */
export function latestPoint<T extends SeriesPoint>(points: readonly T[] | undefined): T | undefined {
  return toSeries(points).at(-1);
}

/** The period before the latest, for a change indicator. */
export function previousPoint<T extends SeriesPoint>(points: readonly T[] | undefined): T | undefined {
  return toSeries(points).at(-2);
}

/** A chart label for a point: the period it measures, not when it was entered. */
export function periodLabel(point: Pick<SeriesPoint, 'periodStart'>, locale?: string): string {
  return new Date(point.periodStart).toLocaleDateString(locale);
}

/**
 * What a widget says when the board's date range holds no value for its KPI.
 * Not "No data": the KPI may well have values outside the range, and a reader
 * took "No data" to mean nothing was ever recorded.
 */
export const NO_VALUES_IN_RANGE = 'No values in this date range';
