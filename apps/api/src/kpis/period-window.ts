import type { Prisma } from '@kpi-nexus/db';

import { clampHistoryFrom } from '../rbac/visibility/kpi-visibility.js';

const MS_PER_DAY = 86_400_000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type PeriodWindow = Pick<Prisma.KPIDataPointWhereInput, 'periodStart' | 'periodEnd'>;

/**
 * The period filter for a read window.
 *
 * A data point covers a period, not an instant, so it belongs to the window
 * when its period OVERLAPS it: `periodEnd >= from` and `periodStart <= to`.
 * Requiring the whole period to sit inside the window (the old rule) dropped
 * every monthly value from a 30-day range and hid the current, unfinished
 * period — a dashboard of monthly KPIs read "No data" (UI-002).
 *
 * `historyWindowDays` is a different thing: a Layer-4 access rule capping how
 * old the data a principal may read is. It stays a hard floor on `periodStart`,
 * exactly as before, and is never widened by the caller's window.
 */
export function periodWindowWhere(
  opts: { from?: Date; to?: Date },
  historyWindowDays: number | null | undefined,
): PeriodWindow {
  const where: PeriodWindow = {};
  const periodStart: { gte?: Date; lte?: Date } = {};

  // The access floor, independent of what the caller asked for.
  const floor = clampHistoryFrom(undefined, historyWindowDays);
  if (floor) periodStart.gte = floor;
  if (opts.to) periodStart.lte = opts.to;

  if (periodStart.gte || periodStart.lte) where.periodStart = periodStart;
  if (opts.from) where.periodEnd = { gte: opts.from };
  return where;
}

/**
 * Parse a `to` query value. A date-only `2026-11-16` means the END of that day:
 * taken as its first instant, every value recorded today would fall outside the
 * range the user picked.
 */
export function endOfDayIfDateOnly(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return DATE_ONLY.test(value) ? new Date(date.getTime() + MS_PER_DAY - 1) : date;
}

/** Parse a `from` query value; a date-only value already means the start of that day. */
export function parseFrom(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
