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

export type KpiScope = 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';

export interface KpiVisibilityContext {
  organizationId: string;
  userId: string;
  isAdmin: boolean;
  /** orgUnitIds the user manages (memberRole MANAGER or LEAD). */
  managedOrgUnitIds: readonly string[];
  /** userIds that report (directly or indirectly) to this user. */
  directReportIds: readonly string[];
  /** orgUnitIds the user is a non-managing member of. */
  memberOrgUnitIds: readonly string[];
}

/**
 * The shape of the Prisma `where` fragment. Mirrors what `prisma.kpi.findMany`
 * will accept once the Kpi model lands in P2. Until then this is the source
 * of truth — P2's KpisModule will narrow it against Prisma.KpiWhereInput.
 */
export interface KpiVisibilityWhere {
  organizationId: string;
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
  if (ctx.isAdmin) {
    // Admins see every KPI in the tenant — no scope branches.
    return { organizationId: ctx.organizationId };
  }

  const branches: KpiVisibilityOrBranch[] = [{ scope: 'ORG_WIDE' }];

  // PER_UNIT — managed + member, deduped
  const orgUnitIds = uniq([...ctx.managedOrgUnitIds, ...ctx.memberOrgUnitIds]);
  if (orgUnitIds.length > 0) {
    branches.push({
      scope: 'PER_UNIT',
      orgUnitAssignments: { some: { orgUnitId: { in: orgUnitIds } } },
    });
  }

  // PER_USER — self + direct reports (manager); Employee/Viewer only see self
  const userIds = uniq([ctx.userId, ...ctx.directReportIds]);
  branches.push({
    scope: 'PER_USER',
    userAssignments: { some: { userId: { in: userIds } } },
  });

  return {
    organizationId: ctx.organizationId,
    OR: branches,
  };
}

function uniq<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
