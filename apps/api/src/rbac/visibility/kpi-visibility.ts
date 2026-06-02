/**
 * `buildKpiVisibilityWhere` produces the Prisma `where` fragment that every
 * KPI list endpoint must apply to filter rows by the current principal's
 * scope + role per spec §5.5 and §6.
 *
 * Lands in P1 (even though the Kpi model itself ships in P2) because the
 * whole KPI engine's row-level filtering depends on this being correct
 * from day one. Tested exhaustively across 3 scopes × 4 default roles
 * (spec exit criteria for P1).
 *
 * Visibility matrix:
 *
 *               | ORG_WIDE | PER_UNIT             | PER_USER
 *   ------------|----------|----------------------|----------------------
 *   Admin       | all      | all                  | all
 *   Manager     | all      | managed orgUnits     | direct reports
 *   Employee    | all      | member orgUnits      | self only
 *   Viewer      | all      | member orgUnits      | self only
 *
 * Read-vs-mutate is enforced via @RequirePermissions on endpoints, not via
 * visibility — Employee and Viewer see the same rows; Viewer just can't
 * change them.
 */

import type { AccessProfile, Scope } from '@kpi-nexus/contracts';

export type KpiScope = 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';

export interface KpiVisibilityContext {
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  /**
   * The principal's configured "whose data" scope for the KPIS domain. Drives how
   * wide the row filter is: `ORG` (all) ⊃ `UNITS` (units + reports) ⊃
   * `DIRECT_REPORTS` (reports, no units) ⊃ `SELF` (self only). `UNITS` is the
   * non-admin default and reproduces the legacy behaviour.
   */
  scope: Scope;
  /** orgUnitIds the user manages (memberRole MANAGER or LEAD). */
  managedOrgUnitIds: readonly string[];
  /** userIds that report (directly or indirectly) to this user. */
  directReportIds: readonly string[];
  /** orgUnitIds the user is a non-managing member of. */
  memberOrgUnitIds: readonly string[];
  /**
   * Layer-3 data-type allowlist (Phase 3): when set, the principal sees only KPIs in
   * these categories — an AND constraint orthogonal to scope. `null`/`undefined` = all
   * categories (parity); `[]` = none. Admins bypass it entirely.
   */
  allowedCategoryIds?: readonly string[] | null;
}

/**
 * The shape of the Prisma `where` fragment. Mirrors what `prisma.kpi.findMany`
 * will accept once the Kpi model lands in P2. Until then this is the source
 * of truth — P2's KpisModule will narrow it against Prisma.KpiWhereInput.
 */
export interface KpiVisibilityWhere {
  organizationId: string;
  /** Layer-3 category allowlist (Phase 3) — AND'd with the scope branches. */
  categoryId?: { in: readonly string[] };
  OR?: Array<KpiVisibilityOrBranch>;
}

export type KpiVisibilityOrBranch =
  | { scope: 'ORG_WIDE' }
  | {
      scope: 'PER_UNIT';
      orgUnitAssignments: {
        some: { orgUnitId: { in: readonly string[] } };
      };
    }
  | {
      scope: 'PER_USER';
      userAssignments: {
        some: { userId: { in: readonly string[] } };
      };
    };

export function buildKpiVisibilityWhere(ctx: KpiVisibilityContext): KpiVisibilityWhere {
  // Admins bypass every layer — see the whole tenant, all categories.
  if (ctx.isAdmin) {
    return { organizationId: ctx.organizationId };
  }

  const where: KpiVisibilityWhere = { organizationId: ctx.organizationId };
  // Layer 3 — category allowlist (null/undefined = all). Orthogonal AND to scope:
  // even ORG_WIDE KPIs outside the allowed categories are hidden.
  if (ctx.allowedCategoryIds != null) {
    where.categoryId = { in: ctx.allowedCategoryIds };
  }

  // ORG scope (non-admin) ⇒ every category-allowed KPI in the tenant, no scope branches.
  if (ctx.scope === 'ORG') {
    return where;
  }

  // ORG_WIDE KPIs are always visible regardless of scope.
  const branches: KpiVisibilityOrBranch[] = [{ scope: 'ORG_WIDE' }];

  // PER_UNIT (managed ∪ member units) — only at UNITS scope; narrower scopes drop it.
  if (ctx.scope === 'UNITS') {
    const orgUnitIds = uniq([...ctx.managedOrgUnitIds, ...ctx.memberOrgUnitIds]);
    if (orgUnitIds.length > 0) {
      branches.push({
        scope: 'PER_UNIT',
        orgUnitAssignments: { some: { orgUnitId: { in: orgUnitIds } } },
      });
    }
  }

  // PER_USER — SELF sees only self; UNITS/DIRECT_REPORTS add direct + indirect reports.
  const userIds = ctx.scope === 'SELF' ? [ctx.userId] : uniq([ctx.userId, ...ctx.directReportIds]);
  branches.push({
    scope: 'PER_USER',
    userAssignments: { some: { userId: { in: userIds } } },
  });

  where.OR = branches;
  return where;
}

function uniq<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Layer-3 category-visibility predicate shared by the KPI read paths that don't go
 * through {@link buildKpiVisibilityWhere} (embed tokens, targets/bands/benchmarks,
 * org-unit/user assignment lists, cascades, snapshots/share-links). Keeps identical
 * semantics: a null/undefined allowlist ⇒ all (admins + unconfigured roles); when an
 * allowlist is set, a KPI with a null category is hidden, mirroring `categoryId IN (…)`.
 */
export function isCategoryAllowed(
  allowlist: readonly string[] | null | undefined,
  categoryId: string | null | undefined,
): boolean {
  if (allowlist == null) return true;
  return categoryId != null && allowlist.includes(categoryId);
}

/**
 * Adapt a resolved {@link AccessProfile} into the {@link KpiVisibilityContext}
 * that `buildKpiVisibilityWhere` consumes. Parity bridge for Phase 1: the KPI
 * services now derive their visibility from the centralized `AccessContextService`
 * (via this profile) instead of re-querying memberships locally. Behaviour is
 * identical for admins and unit-managers; `directReportIds` may now include
 * indirect reports (the documented §6 intent the local builder under-delivered).
 */
export function kpiContextFromProfile(
  organizationId: string,
  userId: string,
  profile: AccessProfile,
): KpiVisibilityContext {
  return {
    organizationId,
    userId,
    isAdmin: profile.isAdmin,
    scope: profile.scopeByDomain.KPIS ?? 'UNITS',
    allowedCategoryIds: profile.dataTypeFilters.kpiCategoryIds,
    managedOrgUnitIds: profile.context.managedOrgUnitIds,
    memberOrgUnitIds: profile.context.memberOrgUnitIds,
    directReportIds: profile.context.directReportIds,
  };
}
