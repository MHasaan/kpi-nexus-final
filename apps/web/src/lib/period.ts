import { type FiscalConfig, currentPeriod as sharedCurrentPeriod } from '@kpi-nexus/contracts';

/**
 * The period a recorded value covers.
 *
 * Recording used `new Date()` for both ends, so every value was stamped with
 * the instant it was typed rather than the month or week it measures. The
 * default now follows the KPI's own frequency, and the user can change it.
 */
export interface Period {
  /** YYYY-MM-DD, as an <input type="date"> expects. */
  periodStart: string;
  periodEnd: string;
}

/**
 * The period a value recorded `now` would cover, for a KPI of this frequency,
 * in the organisation's calendar (fiscal year start, first day of the week).
 * With no calendar given: the calendar year and Monday weeks.
 */
export function currentPeriod(frequency: string, now: Date = new Date(), config?: FiscalConfig): Period {
  return sharedCurrentPeriod(frequency, now, config);
}

/** A period in words: one day, or both ends of a range. */
export function periodLabel(period: Period, locale?: string): string {
  const start = new Date(period.periodStart);
  const end = new Date(period.periodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '—';
  const show = (d: Date) => d.toLocaleDateString(locale, { timeZone: 'UTC' });
  return period.periodStart === period.periodEnd ? show(start) : `${show(start)} – ${show(end)}`;
}

/** The API takes instants; a date-only period means the whole of its last day. */
export function toApiPeriod(period: Period): { periodStart: string; periodEnd: string } {
  return {
    periodStart: new Date(`${period.periodStart}T00:00:00.000Z`).toISOString(),
    periodEnd: new Date(`${period.periodEnd}T23:59:59.999Z`).toISOString(),
  };
}
