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

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const utc = (year: number, monthIndex: number, day: number): Date => new Date(Date.UTC(year, monthIndex, day));

/** The period a value recorded `now` would cover, for a KPI of this frequency. */
export function currentPeriod(frequency: string, now: Date = new Date()): Period {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  switch (frequency) {
    case 'WEEKLY': {
      // Monday to Sunday; getUTCDay() is 0 on Sunday.
      const offset = (now.getUTCDay() + 6) % 7;
      const monday = utc(year, month, day - offset);
      return { periodStart: iso(monday), periodEnd: iso(utc(year, month, day - offset + 6)) };
    }
    case 'MONTHLY':
      // Day 0 of the next month is the last day of this one.
      return { periodStart: iso(utc(year, month, 1)), periodEnd: iso(utc(year, month + 1, 0)) };
    case 'QUARTERLY': {
      const firstMonth = Math.floor(month / 3) * 3;
      return { periodStart: iso(utc(year, firstMonth, 1)), periodEnd: iso(utc(year, firstMonth + 3, 0)) };
    }
    case 'YEARLY':
      return { periodStart: iso(utc(year, 0, 1)), periodEnd: iso(utc(year, 12, 0)) };
    default:
      // DAILY, and anything with no natural period (ad hoc, custom, real time).
      return { periodStart: iso(utc(year, month, day)), periodEnd: iso(utc(year, month, day)) };
  }
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
