/**
 * The periods a forecast is for.
 *
 * The forecasting service numbers its predictions "t+1", "t+2"…: so many
 * periods after the last value it was given. On a page that is not a date.
 * Counting from the start of the last recorded period, by the KPI's frequency,
 * gives the real one.
 */

const MONTHS_PER_STEP: Readonly<Record<string, number>> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };
const DAYS_PER_STEP: Readonly<Record<string, number>> = { DAILY: 1, WEEKLY: 7 };

/**
 * The first day (YYYY-MM-DD) of the period `stepsAhead` periods after the one
 * starting on `lastPeriodStart`. Null when there is nothing to count from or
 * the frequency is not one this knows: no date is made up.
 */
export function forecastPeriodStart(lastPeriodStart: string | null | undefined, frequency: string | null | undefined, stepsAhead: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(lastPeriodStart ?? '');
  if (!match || !frequency) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const months = MONTHS_PER_STEP[frequency];
  const days = DAYS_PER_STEP[frequency];
  let next: Date;
  if (months !== undefined) next = new Date(Date.UTC(year, month - 1 + months * stepsAhead, day));
  else if (days !== undefined) next = new Date(Date.UTC(year, month - 1, day + days * stepsAhead));
  else return null;
  return Number.isNaN(next.getTime()) ? null : next.toISOString().slice(0, 10);
}
