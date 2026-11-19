/**
 * A per-person or per-unit KPI in an organisation-level view (UI-018).
 *
 * Such a KPI has no one value: each person or unit it is assigned to has their
 * own. Where a view gives a KPI a single line — the home page, the board pack,
 * a report — it used to print the value of whichever holder recorded last.
 * By the owner's decision (2026-11-19) it reads as a count of holders on track.
 */
export interface KpiHolders {
  /** Holders the reader may see. */
  total: number;
  /** Of those, how many have recorded a value. */
  withValue: number;
  /** Of those, how many have a target to be held to: their own, or the KPI's. */
  withTarget: number;
  /** Of those, how many are on track (or beyond) against their own target. */
  onTrack: number;
}

/**
 * "1 of 2 people on track", "3 of 3 units on track", "No values yet from 4
 * people" — and, when nobody has a target to be on track against, "1 of 2
 * units recorded": it used to read "0 of 2 units on track".
 */
export function holdersText(holders: KpiHolders, scope: string): string {
  const unit = scope === 'PER_UNIT';
  const noun = (n: number) => (unit ? (n === 1 ? 'unit' : 'units') : n === 1 ? 'person' : 'people');
  if (holders.withValue === 0) return `No values yet from ${holders.total} ${noun(holders.total)}`;
  if (holders.withTarget === 0) return `${holders.withValue} of ${holders.total} ${noun(holders.total)} recorded`;
  return `${holders.onTrack} of ${holders.total} ${noun(holders.total)} on track`;
}

/**
 * One status for the KPI from its holders: all on track → on track, none → off
 * track, some → at risk. A holder who has not recorded yet is not on track.
 * With no target for anyone there is nothing to be on or off: no target.
 */
export function holdersHealth(holders: KpiHolders): 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NO_DATA' | 'NO_TARGET' {
  if (holders.withValue === 0) return 'NO_DATA';
  if (holders.withTarget === 0) return 'NO_TARGET';
  if (holders.onTrack === holders.total) return 'ON_TRACK';
  if (holders.onTrack === 0) return 'OFF_TRACK';
  return 'AT_RISK';
}
