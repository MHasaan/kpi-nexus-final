import { describe, expect, it } from 'vitest';

import { endOfDayIfDateOnly, periodWindowWhere } from './period-window.js';

const d = (iso: string): Date => new Date(iso);

describe('periodWindowWhere (UI-002)', () => {
  it('no window and no history limit: every period is readable', () => {
    expect(periodWindowWhere({}, null)).toEqual({});
  });

  it('a period that overlaps the window counts as in it', () => {
    // A monthly period (Oct 1 – Oct 28) against a 30-day window that starts mid-October.
    const where = periodWindowWhere({ from: d('2026-10-17T00:00:00Z'), to: d('2026-11-16T23:59:59Z') }, null);
    expect(where).toEqual({
      periodEnd: { gte: d('2026-10-17T00:00:00Z') },
      periodStart: { lte: d('2026-11-16T23:59:59Z') },
    });
  });

  it('the current, unfinished period is in the window: only its start must be inside', () => {
    const where = periodWindowWhere({ to: d('2026-11-16T23:59:59Z') }, null);
    expect(where.periodStart).toEqual({ lte: d('2026-11-16T23:59:59Z') });
    // Nothing bounds periodEnd, so a period ending after `to` still counts.
    expect(where.periodEnd).toBeUndefined();
  });

  it('`from` alone bounds the end, so an older period that is still running counts', () => {
    const where = periodWindowWhere({ from: d('2026-11-01T00:00:00Z') }, null);
    expect(where).toEqual({ periodEnd: { gte: d('2026-11-01T00:00:00Z') } });
  });

  it('the history limit stays a hard floor on periodStart (an access rule, not a view)', () => {
    const where = periodWindowWhere({}, 90);
    const floor = (where.periodStart as { gte: Date }).gte;
    const expected = Date.now() - 90 * 86_400_000;
    expect(Math.abs(floor.getTime() - expected)).toBeLessThan(5_000);
  });

  it('a window wider than the history limit never reads past the floor', () => {
    const where = periodWindowWhere({ from: d('2000-01-01T00:00:00Z'), to: d('2026-11-16T00:00:00Z') }, 30);
    const periodStart = where.periodStart as { gte: Date; lte: Date };
    const floor = Date.now() - 30 * 86_400_000;
    expect(Math.abs(periodStart.gte.getTime() - floor)).toBeLessThan(5_000);
    expect(periodStart.lte).toEqual(d('2026-11-16T00:00:00Z'));
    // The caller's `from` only bounds the end; the floor is what limits how far back we read.
    expect(where.periodEnd).toEqual({ gte: d('2000-01-01T00:00:00Z') });
  });
});

describe('endOfDayIfDateOnly', () => {
  it('a date-only `to` means the end of that day, so today’s values are included', () => {
    expect(endOfDayIfDateOnly('2026-11-16')?.toISOString()).toBe('2026-11-16T23:59:59.999Z');
  });

  it('a full timestamp is taken as given', () => {
    expect(endOfDayIfDateOnly('2026-11-16T08:30:00.000Z')?.toISOString()).toBe('2026-11-16T08:30:00.000Z');
  });

  it('nothing in, nothing out; rubbish in, nothing out', () => {
    expect(endOfDayIfDateOnly(undefined)).toBeUndefined();
    expect(endOfDayIfDateOnly('not-a-date')).toBeUndefined();
  });
});
