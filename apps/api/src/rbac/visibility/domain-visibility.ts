import { DOMAIN_DEFAULT_SCOPE, type Scope } from '@kpi-nexus/contracts';

/**
 * Per-domain non-admin default scope — defined in contracts so the web role
 * editor can show it. Re-exported here for the API's existing imports.
 */
export { DOMAIN_DEFAULT_SCOPE };

export interface ScopedUserCtx {
  userId: string;
  directReportIds: readonly string[];
  /** Distinct user-ids in the principal's managed ∪ member org units. */
  unitMemberUserIds: readonly string[];
}

/**
 * The set of user-ids whose owned/created/assigned rows are visible at `scope`.
 * `null` ⇒ no user filter (ORG / admin — every row in tenant). Used by the
 * derived domains (Tasks/OKRs/Reports), the dashboards owner branch, and the
 * PEOPLE domain (which people a principal can see).
 */
export function scopedUserIds(scope: Scope, ctx: ScopedUserCtx): string[] | null {
  if (scope === 'ORG') return null;
  if (scope === 'SELF') return [ctx.userId];
  if (scope === 'DIRECT_REPORTS') return uniq([ctx.userId, ...ctx.directReportIds]);
  // UNITS
  return uniq([ctx.userId, ...ctx.directReportIds, ...ctx.unitMemberUserIds]);
}

export interface ScopedUnitCtx {
  /** Units the principal belongs to or manages. */
  ownUnitIds: readonly string[];
  /** Units the principal's (recursive) reports belong to. */
  reportUnitIds: readonly string[];
  /** Every org unit in the tenant (id + parent), for descendant expansion. */
  units: ReadonlyArray<{ id: string; parentUnitId: string | null }>;
}

/**
 * The org units visible at `scope` for the ORG domain (BE-004). `null` ⇒ all.
 * SELF: my units. DIRECT_REPORTS: mine ∪ my reports' units. UNITS: my units and
 * every unit below them (a manager sees their subtree). Parent cycles from
 * legacy data are walked once.
 */
export function scopedOrgUnitIds(scope: Scope, ctx: ScopedUnitCtx): string[] | null {
  if (scope === 'ORG') return null;
  if (scope === 'SELF') return uniq([...ctx.ownUnitIds]);
  if (scope === 'DIRECT_REPORTS') return uniq([...ctx.ownUnitIds, ...ctx.reportUnitIds]);
  // UNITS: my units + descendants.
  const children = new Map<string, string[]>();
  for (const u of ctx.units) {
    if (!u.parentUnitId) continue;
    children.set(u.parentUnitId, [...(children.get(u.parentUnitId) ?? []), u.id]);
  }
  const out = new Set<string>();
  const stack = [...ctx.ownUnitIds];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return [...out];
}

function uniq<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}
