import type { Domain, Scope } from '@kpi-nexus/contracts';

/**
 * Per-domain non-admin default scope when a role/override sets nothing. Chosen to
 * reproduce each domain's *current* behaviour (Phase 2.5 ships at parity):
 *   KPIS=UNITS (legacy), DASHBOARDS=SELF (own ∪ isShared via the floor),
 *   TASKS=SELF (creator/assignee), OKRS/REPORTS/ALERTS=ORG (org-wide today).
 * The non-enforced domains keep UNITS — cosmetic, only surfaces on /auth/me.
 */
export const DOMAIN_DEFAULT_SCOPE: Record<Domain, Scope> = {
  KPIS: 'UNITS',
  DASHBOARDS: 'SELF',
  ALERTS: 'ORG',
  REPORTS: 'ORG',
  ANALYTICS: 'UNITS',
  INSIGHTS: 'UNITS',
  OKRS: 'ORG',
  TASKS: 'SELF',
  PEOPLE: 'UNITS',
  ORG: 'UNITS',
};

export interface ScopedUserCtx {
  userId: string;
  directReportIds: readonly string[];
  /** Distinct user-ids in the principal's managed ∪ member org units. */
  unitMemberUserIds: readonly string[];
}

/**
 * The set of user-ids whose owned/created/assigned rows are visible at `scope`.
 * `null` ⇒ no user filter (ORG / admin — every row in tenant). Used by the
 * derived domains (Tasks/OKRs/Reports) and the dashboards owner branch.
 */
export function scopedUserIds(scope: Scope, ctx: ScopedUserCtx): string[] | null {
  if (scope === 'ORG') return null;
  if (scope === 'SELF') return [ctx.userId];
  if (scope === 'DIRECT_REPORTS') return uniq([ctx.userId, ...ctx.directReportIds]);
  // UNITS
  return uniq([ctx.userId, ...ctx.directReportIds, ...ctx.unitMemberUserIds]);
}

function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}
