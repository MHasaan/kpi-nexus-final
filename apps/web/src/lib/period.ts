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

/**
 * The period once its start date is changed. The KPI's frequency says how long
 * a period is, so the end follows the start — a monthly KPI moved to 1 October
 * ends on 31 October — until the person sets the end themself: an end they
 * chose is kept. Entering earlier months otherwise meant fixing two dates for
 * every value, or storing each one against a span of several months.
 */
export function periodFromStart(frequency: string, periodStart: string, previous: Period, endChosen: boolean, config?: FiscalConfig): Period {
  const day = new Date(`${periodStart}T00:00:00.000Z`);
  if (endChosen || Number.isNaN(day.getTime())) return { ...previous, periodStart };
  return { periodStart, periodEnd: currentPeriod(frequency, day, config).periodEnd };
}

/** What the one-value form keeps about its period. */
export interface RecordPeriod {
  period: Period;
  /** The person has changed the period: the calendar arriving no longer resets it. */
  touched: boolean;
  /** The person set the end themself: moving the start no longer moves it. */
  endChosen: boolean;
}

export type RecordPeriodAction =
  /** The organisation's calendar is known (it arrives a moment after the form). */
  | { type: 'calendar'; frequency: string; config: FiscalConfig; now: Date }
  | { type: 'start'; frequency: string; value: string; config?: FiscalConfig }
  | { type: 'end'; value: string };

/** Before the calendar is known: the period `now` falls in, in the calendar year and Monday weeks. */
export function initialRecordPeriod(frequency: string, now: Date = new Date()): RecordPeriod {
  return { period: currentPeriod(frequency, now), touched: false, endChosen: false };
}

/**
 * The form's period as one reducer. The calendar's default used to be set by an effect that read "has the
 * person changed it?" as it stood when the calendar arrived: a date typed in that same moment was applied
 * first and then overwritten by the default. Here every action reads the state as it is when applied, so
 * what the person typed stands whichever of the two comes first.
 */
export function recordPeriodReducer(state: RecordPeriod, action: RecordPeriodAction): RecordPeriod {
  switch (action.type) {
    case 'calendar':
      return state.touched ? state : { ...state, period: currentPeriod(action.frequency, action.now, action.config) };
    case 'start':
      return { ...state, touched: true, period: periodFromStart(action.frequency, action.value, state.period, state.endChosen, action.config) };
    case 'end':
      return { ...state, touched: true, endChosen: true, period: { ...state.period, periodEnd: action.value } };
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
