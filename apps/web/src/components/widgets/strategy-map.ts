import type { DashboardSummaryRow } from '../../lib/api-client';

/** The four balanced-scorecard perspectives, in the order a strategy map is read (top to bottom). */
export const PERSPECTIVES = ['FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH'] as const;
export type Perspective = (typeof PERSPECTIVES)[number];

export interface PerspectiveTally {
  perspective: Perspective;
  total: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  /** No target to measure against, or no value recorded yet. */
  unrated: number;
  /** The worst state present — what the tile is coloured by. */
  worst: 'OFF_TRACK' | 'AT_RISK' | 'ON_TRACK' | 'NONE';
}

export interface StrategyMapTally {
  perspectives: PerspectiveTally[];
  /** KPIs with no perspective chosen: on no tile, so they are counted aloud. */
  unassigned: number;
}

/** Count the KPIs in each perspective by health. */
export function strategyMapTally(rows: readonly Pick<DashboardSummaryRow, 'scorecardQuadrant' | 'status'>[]): StrategyMapTally {
  const perspectives = PERSPECTIVES.map((perspective): PerspectiveTally => {
    const mine = rows.filter((r) => r.scorecardQuadrant === perspective);
    const count = (status: string) => mine.filter((r) => r.status === status).length;
    const onTrack = count('ON_TRACK');
    const atRisk = count('AT_RISK');
    const offTrack = count('OFF_TRACK');
    return {
      perspective,
      total: mine.length,
      onTrack,
      atRisk,
      offTrack,
      unrated: mine.length - onTrack - atRisk - offTrack,
      worst: offTrack > 0 ? 'OFF_TRACK' : atRisk > 0 ? 'AT_RISK' : onTrack > 0 ? 'ON_TRACK' : 'NONE',
    };
  });
  const known = new Set<string>(PERSPECTIVES);
  return { perspectives, unassigned: rows.filter((r) => !r.scorecardQuadrant || !known.has(r.scorecardQuadrant)).length };
}

/** "3 KPIs" / "1 KPI" / "No KPIs yet". */
export function kpiCount(total: number): string {
  if (total === 0) return 'No KPIs yet';
  return total === 1 ? '1 KPI' : `${total} KPIs`;
}

/** The counts worth saying, worst first: "1 off track · 2 on track". Empty when there is nothing rated. */
export function tallyWords(tally: PerspectiveTally): string {
  const parts: string[] = [];
  if (tally.offTrack > 0) parts.push(`${tally.offTrack} off track`);
  if (tally.atRisk > 0) parts.push(`${tally.atRisk} at risk`);
  if (tally.onTrack > 0) parts.push(`${tally.onTrack} on track`);
  if (tally.unrated > 0) parts.push(`${tally.unrated} not rated`);
  return parts.join(' · ');
}
