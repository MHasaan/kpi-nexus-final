/**
 * An organisation's calendar: which month its fiscal year starts in and which
 * day its week starts on. One set of rules for the web app and the API, so a
 * "quarter" or a "week" means the same thing wherever it is computed.
 *
 * All dates are UTC days, written YYYY-MM-DD.
 */

export interface FiscalConfig {
  /** Month the fiscal year starts in, 1 (January) to 12. */
  startMonth: number;
  /** Day the week starts on, 0 (Sunday) to 6 (Saturday). */
  weekStartsOn: number;
}

/** A calendar year and weeks that start on Monday. */
export const DEFAULT_FISCAL_CONFIG: FiscalConfig = { startMonth: 1, weekStartsOn: 1 };

/** A span of whole days, both ends included. */
export interface DayRange {
  periodStart: string;
  periodEnd: string;
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);
const utc = (year: number, monthIndex: number, day: number): Date => new Date(Date.UTC(year, monthIndex, day));
const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/**
 * The calendar of an organisation as stored (`fiscalCalendar` is free-form
 * JSON holding `startMonth`; `weekStartsOn` is a column). Anything missing or
 * out of range falls back to the default.
 */
export function fiscalConfigOf(org: { fiscalCalendar?: unknown; weekStartsOn?: unknown } | null | undefined): FiscalConfig {
  const calendar = org?.fiscalCalendar;
  const startMonth = calendar && typeof calendar === 'object' ? (calendar as { startMonth?: unknown }).startMonth : undefined;
  return {
    startMonth: inRange(startMonth, 1, 12) ? startMonth : DEFAULT_FISCAL_CONFIG.startMonth,
    weekStartsOn: inRange(org?.weekStartsOn, 0, 6) ? org.weekStartsOn : DEFAULT_FISCAL_CONFIG.weekStartsOn,
  };
}

/** The week containing `date`, for a week that starts on `weekStartsOn`. */
export function weekRange(date: Date, weekStartsOn: number = DEFAULT_FISCAL_CONFIG.weekStartsOn): DayRange {
  const offset = (date.getUTCDay() - weekStartsOn + 7) % 7;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate() - offset;
  return { periodStart: iso(utc(year, month, day)), periodEnd: iso(utc(year, month, day + 6)) };
}

/** Months since the fiscal year containing `date` began, and the calendar year it began in. */
function fiscalPosition(date: Date, startMonth: number): { startYear: number; monthsIn: number } {
  const startIndex = startMonth - 1;
  const month = date.getUTCMonth();
  const startYear = month >= startIndex ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return { startYear, monthsIn: (month - startIndex + 12) % 12 };
}

/** The fiscal year containing `date`. */
export function fiscalYearRange(date: Date, startMonth: number = DEFAULT_FISCAL_CONFIG.startMonth): DayRange {
  const { startYear } = fiscalPosition(date, startMonth);
  // Day 0 of the month after the last one is the last day of the year.
  return { periodStart: iso(utc(startYear, startMonth - 1, 1)), periodEnd: iso(utc(startYear, startMonth - 1 + 12, 0)) };
}

/** The fiscal quarter containing `date`: three months, counted from the fiscal year's start. */
export function fiscalQuarterRange(date: Date, startMonth: number = DEFAULT_FISCAL_CONFIG.startMonth): DayRange {
  const { startYear, monthsIn } = fiscalPosition(date, startMonth);
  const first = startMonth - 1 + Math.floor(monthsIn / 3) * 3;
  return { periodStart: iso(utc(startYear, first, 1)), periodEnd: iso(utc(startYear, first + 3, 0)) };
}

/** The period a value recorded at `now` covers, for a KPI of this frequency, in this organisation's calendar. */
export function currentPeriod(frequency: string, now: Date = new Date(), config: FiscalConfig = DEFAULT_FISCAL_CONFIG): DayRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  switch (frequency) {
    case 'WEEKLY':
      return weekRange(now, config.weekStartsOn);
    case 'MONTHLY':
      return { periodStart: iso(utc(year, month, 1)), periodEnd: iso(utc(year, month + 1, 0)) };
    case 'QUARTERLY':
      return fiscalQuarterRange(now, config.startMonth);
    case 'YEARLY':
      return fiscalYearRange(now, config.startMonth);
    default: {
      // DAILY, and anything with no natural period (ad hoc, custom, real time).
      const today = iso(utc(year, month, now.getUTCDate()));
      return { periodStart: today, periodEnd: today };
    }
  }
}
