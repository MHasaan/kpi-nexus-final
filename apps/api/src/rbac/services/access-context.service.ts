import { Injectable } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  DataLimitsConfigSchema,
  DataTypeConfigSchema,
  PageAccessConfigSchema,
  ScopeConfigSchema,
} from '@kpi-nexus/contracts';
import type {
  AccessProfile,
  DataLimits,
  DataLimitsConfig,
  DataTypeConfig,
  Domain,
  PageAccessConfig,
  ResourceGrant,
  Scope,
  ScopeConfig,
} from '@kpi-nexus/contracts';

import type { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import { DOMAIN_DEFAULT_SCOPE, scopedOrgUnitIds, scopedUserIds } from '../visibility/domain-visibility.js';
import { buildKpiVisibilityWhere, kpiContextFromProfile } from '../visibility/kpi-visibility.js';
import { PermissionResolverService } from './permission-resolver.service.js';

const DOMAINS: readonly Domain[] = [
  'KPIS',
  'DASHBOARDS',
  'ALERTS',
  'REPORTS',
  'ANALYTICS',
  'INSIGHTS',
  'OKRS',
  'TASKS',
  'PEOPLE',
  'ORG',
];

/** Max depth walked up the manager chain when resolving indirect reports. */
const MAX_REPORT_DEPTH = 10;

/**
 * Resolves the full {@link AccessProfile} for the current principal — capabilities
 * (from {@link PermissionResolverService}) plus the membership context (managed vs
 * member org units, recursive direct reports) and the derived per-domain scope.
 *
 * Centralizes the membership/manager resolution that the KPI services previously
 * duplicated. Cached per `org:user` (5-min TTL); invalidate on role/override/
 * membership change. Phase 1 = behavioural parity: scope is the derived default
 * and data-type/limits are unrestricted (null).
 */
@Injectable()
export class AccessContextService {
  private readonly cache = new Map<string, { profile: AccessProfile; at: number }>();
  private readonly unitMembersCache = new Map<string, { ids: string[]; at: number }>();
  private readonly ttlMs = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PermissionResolverService,
  ) {}

  async resolveForCurrentPrincipal(): Promise<AccessProfile> {
    const ctx = RequestContextStore.require();
    const key = `${ctx.organizationId}:${ctx.userId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.profile;

    const resolved = await this.resolver.resolveForUser(
      ctx.organizationId,
      ctx.userId,
      ctx.roleId,
    );
    const isAdmin = resolved.isAdmin;
    // Admins bypass the resolver's accumulation, so expand to the full set here —
    // mirrors how /auth/me reports an admin's permissions.
    const capabilities = isAdmin ? [...ALL_PERMISSIONS] : [...resolved.permissions];

    const managedOrgUnitIds: string[] = [];
    const memberOrgUnitIds: string[] = [];
    let directReportIds: string[] = [];

    if (!isAdmin) {
      const memberships = await this.prisma.orgUnitMember.findMany({
        where: { organizationId: ctx.organizationId, userId: ctx.userId, leftAt: null },
        select: { orgUnitId: true, memberRole: true },
      });
      for (const m of memberships) {
        if (m.memberRole === 'MANAGER' || m.memberRole === 'LEAD') {
          managedOrgUnitIds.push(m.orgUnitId);
        } else {
          memberOrgUnitIds.push(m.orgUnitId);
        }
      }
      directReportIds = await this.resolveReportsRecursive(ctx.organizationId, ctx.userId);
    }

    // Derived default scope. Admin ⇒ ORG everywhere. Phase 2: the role's per-domain
    // scopeConfig overrides the default; narrower values (DIRECT_REPORTS/SELF) actually
    // restrict, ORG widens.
    const roleConfig = await this.loadRoleConfig(isAdmin, ctx.organizationId, ctx.roleId);
    // Phase 5 — per-user override REPLACES the role value per-field when set (admins skip).
    // The capability layer is already merged in PermissionResolverService (the guard reads
    // that), so here we only override scope/dataType/limits. ?? chain ⇒ override → role → default.
    const override = isAdmin ? null : await this.loadUserOverride(ctx.organizationId, ctx.userId);
    // Phase 2.5 — per-domain default reproduces each domain's current behaviour
    // (KPIS=UNITS, DASHBOARDS/TASKS=SELF, OKRS/REPORTS/ALERTS=ORG). Admin ⇒ ORG.
    const scopeByDomain = Object.fromEntries(
      DOMAINS.map((d) => [
        d,
        isAdmin ? 'ORG' : (override?.scope[d] ?? roleConfig.scope[d] ?? DOMAIN_DEFAULT_SCOPE[d]),
      ]),
    ) as Record<Domain, Scope>;

    // Phase 3.5 — per-entity ResourcePermission grants held by the user or their role.
    // Admins bypass per-entity grants (they already see everything). Cached with the
    // profile (5-min TTL); the guard path uses the uncached PermissionResolver.hasResourceGrant,
    // so endpoint access is immediate — only the list-scoping reflects the cache.
    const now = new Date();
    const grantRows = isAdmin
      ? []
      : await this.prisma.resourcePermission.findMany({
          where: {
            organizationId: ctx.organizationId,
            OR: [
              { subjectType: 'user', subjectId: ctx.userId },
              ...(ctx.roleId ? [{ subjectType: 'role' as const, subjectId: ctx.roleId }] : []),
            ],
            AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
          },
          select: { resourceType: true, resourceId: true, action: true },
        });
    const resourceGrants: ResourceGrant[] = grantRows.map((g) => ({
      resourceType: g.resourceType,
      resourceId: g.resourceId,
      action: g.action as ResourceGrant['action'],
    }));

    // Layer 5 (Phase 7) — page access. Admin ⇒ unrestricted. Else the override's
    // pageAccess (when set) REPLACES the role's wholesale; unset everywhere ⇒ default.
    const rawPage = isAdmin ? null : (override?.pageAccess ?? roleConfig.pageAccess ?? null);
    const pageAccess = { allow: rawPage?.allow ?? null, deny: rawPage?.deny ?? [] };

    const profile: AccessProfile = {
      isAdmin,
      capabilities,
      scopeByDomain,
      // Layer 3 — admins unrestricted; else override → role category allowlist (Phase 3/5).
      // orgUnitIds/dashboardIds enforcement is deferred (stay null).
      dataTypeFilters: {
        kpiCategoryIds:
          override?.dataType.kpiCategoryIds ?? roleConfig.dataType.kpiCategoryIds ?? null,
        orgUnitIds: null,
        dashboardIds: null,
      },
      // Layer 4 — admins/unset ⇒ unlimited (null); else override → role limits (Phase 4/5).
      dataLimits: {
        historyWindowDays:
          override?.limits.historyWindowDays ?? roleConfig.limits.historyWindowDays ?? null,
        maxListRows: override?.limits.maxListRows ?? roleConfig.limits.maxListRows ?? null,
        maxExportRows: override?.limits.maxExportRows ?? roleConfig.limits.maxExportRows ?? null,
      },
      context: { managedOrgUnitIds, memberOrgUnitIds, directReportIds },
      resourceGrants,
      pageAccess,
    };
    this.cache.set(key, { profile, at: Date.now() });
    return profile;
  }

  /**
   * The current principal's KPI category allowlist (`null` ⇒ all categories / admin).
   * Convenience for the sibling KPI read paths that filter rows outside
   * {@link buildKpiVisibilityWhere} — pair with `isCategoryAllowed`.
   */
  async kpiCategoryAllowlist(): Promise<readonly string[] | null> {
    const profile = await this.resolveForCurrentPrincipal();
    return profile.isAdmin ? null : profile.dataTypeFilters.kpiCategoryIds;
  }

  /**
   * Whether the current principal may see KPI `kpiId` — evaluated with the very
   * rule GET /kpis lists by ({@link buildKpiVisibilityWhere}: scope + unit/user
   * assignments + category allowlist), so list, detail, data and summary can't
   * disagree. BE-003: single-KPI reads used a looser hand-rolled rule that
   * ignored the KPIS scope (a SELF user could open unit KPIs by id).
   */
  async isKpiVisible(kpiId: string): Promise<boolean> {
    const ctx = RequestContextStore.require();
    const profile = await this.resolveForCurrentPrincipal();
    const where = buildKpiVisibilityWhere(kpiContextFromProfile(ctx.organizationId, ctx.userId, profile));
    const row = await this.prisma.kPI.findFirst({
      where: { id: kpiId, ...where, deletedAt: null } as Prisma.KPIWhereInput,
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Ids of every KPI the current principal can see (same rule as GET /kpis), or
   * `null` for admins (= no filter). For KPI-derived rows that have no Prisma
   * relation to KPI to filter through (e.g. insights — BE-004).
   */
  async visibleKpiIds(): Promise<string[] | null> {
    const ctx = RequestContextStore.require();
    const profile = await this.resolveForCurrentPrincipal();
    if (profile.isAdmin) return null;
    const where = buildKpiVisibilityWhere(kpiContextFromProfile(ctx.organizationId, ctx.userId, profile));
    const rows = await this.prisma.kPI.findMany({
      where: { ...where, deletedAt: null } as Prisma.KPIWhereInput,
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * PEOPLE domain (BE-004): ids of the people the current principal may see, or
   * `null` for everyone (admins, or the ORG default). Same user-set rule as the
   * other derived domains ({@link scopedUserIds}); self is always included.
   */
  async visiblePeopleIds(): Promise<string[] | null> {
    const ctx = RequestContextStore.require();
    const profile = await this.resolveForCurrentPrincipal();
    if (profile.isAdmin) return null;
    const scope = profile.scopeByDomain.PEOPLE ?? DOMAIN_DEFAULT_SCOPE.PEOPLE;
    if (scope === 'ORG') return null;
    const unitMemberUserIds = scope === 'UNITS' ? await this.unitMemberUserIds() : [];
    return scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    });
  }

  /** Whether the current principal may see person `userId` (PEOPLE domain). */
  async isPersonVisible(userId: string): Promise<boolean> {
    const ids = await this.visiblePeopleIds();
    return ids === null || ids.includes(userId);
  }

  /**
   * ORG domain (BE-004): ids of the org units the current principal may see, or
   * `null` for all (admins, or the ORG default). See {@link scopedOrgUnitIds}.
   */
  async visibleOrgUnitIds(): Promise<string[] | null> {
    const ctx = RequestContextStore.require();
    const profile = await this.resolveForCurrentPrincipal();
    if (profile.isAdmin) return null;
    const scope = profile.scopeByDomain.ORG ?? DOMAIN_DEFAULT_SCOPE.ORG;
    if (scope === 'ORG') return null;
    const ownUnitIds = [
      ...new Set([...profile.context.managedOrgUnitIds, ...profile.context.memberOrgUnitIds]),
    ];
    let reportUnitIds: string[] = [];
    if (scope === 'DIRECT_REPORTS' && profile.context.directReportIds.length > 0) {
      const rows = await this.prisma.orgUnitMember.findMany({
        where: {
          organizationId: ctx.organizationId,
          userId: { in: [...profile.context.directReportIds] },
          leftAt: null,
        },
        select: { orgUnitId: true },
      });
      reportUnitIds = rows.map((r) => r.orgUnitId);
    }
    const units =
      scope === 'UNITS'
        ? await this.prisma.orgUnit.findMany({
            where: { organizationId: ctx.organizationId },
            select: { id: true, parentUnitId: true },
          })
        : [];
    return scopedOrgUnitIds(scope, { ownUnitIds, reportUnitIds, units });
  }

  /** Whether the current principal may see org unit `unitId` (ORG domain). */
  async isOrgUnitVisible(unitId: string): Promise<boolean> {
    const ids = await this.visibleOrgUnitIds();
    return ids === null || ids.includes(unitId);
  }

  /**
   * ANALYTICS domain (BE-004): a ceiling on top of KPI visibility. Analytics
   * endpoints already require the KPI to be visible (KPIS scope); this evaluates
   * the same KPI rule at the ANALYTICS scope, so the effective reach is the
   * narrower of the two. ORG (the default) adds no ceiling.
   */
  async isKpiAnalyticsAllowed(kpiId: string): Promise<boolean> {
    const ctx = RequestContextStore.require();
    const profile = await this.resolveForCurrentPrincipal();
    if (profile.isAdmin) return true;
    const scope = profile.scopeByDomain.ANALYTICS ?? DOMAIN_DEFAULT_SCOPE.ANALYTICS;
    if (scope === 'ORG') return true;
    const where = buildKpiVisibilityWhere({
      ...kpiContextFromProfile(ctx.organizationId, ctx.userId, profile),
      scope,
    });
    const row = await this.prisma.kPI.findFirst({
      where: { id: kpiId, ...where, deletedAt: null } as Prisma.KPIWhereInput,
      select: { id: true },
    });
    return row !== null;
  }

  /** Resource ids the principal holds a grant for, for a given type + acceptable actions. */
  async grantedResourceIds(resourceType: string, actions: readonly string[]): Promise<string[]> {
    const profile = await this.resolveForCurrentPrincipal();
    return profile.resourceGrants
      .filter((g) => g.resourceType === resourceType && actions.includes(g.action))
      .map((g) => g.resourceId);
  }

  /**
   * Distinct user-ids in the current principal's managed ∪ member org units —
   * the "people in my units" set used by the derived domains' UNITS scope.
   * Admins ⇒ [] (they never scope by membership). Cached per org:user (5-min TTL).
   */
  async unitMemberUserIds(): Promise<string[]> {
    const ctx = RequestContextStore.require();
    const key = `${ctx.organizationId}:${ctx.userId}`;
    const hit = this.unitMembersCache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.ids;

    const profile = await this.resolveForCurrentPrincipal();
    if (profile.isAdmin) {
      this.unitMembersCache.set(key, { ids: [], at: Date.now() });
      return [];
    }
    const unitIds = [
      ...new Set([...profile.context.managedOrgUnitIds, ...profile.context.memberOrgUnitIds]),
    ];
    if (unitIds.length === 0) {
      this.unitMembersCache.set(key, { ids: [], at: Date.now() });
      return [];
    }
    const rows = await this.prisma.orgUnitMember.findMany({
      where: { organizationId: ctx.organizationId, orgUnitId: { in: unitIds }, leftAt: null },
      select: { userId: true },
    });
    const ids = [...new Set(rows.map((r) => r.userId))];
    this.unitMembersCache.set(key, { ids, at: Date.now() });
    return ids;
  }

  /**
   * The current principal's Layer-4 {@link DataLimits} (all `null` ⇒ unlimited / admin).
   * Convenience for the user-facing KPI read paths that clamp history/rows via
   * `clampHistoryFrom` / `clampTake`.
   */
  async dataLimits(): Promise<DataLimits> {
    // System batch jobs (e.g. scheduled reports) run as the creator for visibility
    // but must NOT inherit that user's personal read quotas — honour bypassDataLimits.
    if (RequestContextStore.get()?.bypassDataLimits) {
      return { historyWindowDays: null, maxListRows: null, maxExportRows: null };
    }
    const profile = await this.resolveForCurrentPrincipal();
    return profile.dataLimits;
  }

  /**
   * The direct role's `scopeConfig` (Phase 2, Layer 2) + `dataTypeConfig` (Phase 3,
   * Layer 3), fetched together. Admins skip it (always ORG / unrestricted). Inherited-
   * role merge is deferred (Phase 5). Invalid/absent JSON ⇒ `{}` ⇒ defaults/parity.
   */
  private async loadRoleConfig(
    isAdmin: boolean,
    organizationId: string,
    roleId: string | null,
  ): Promise<{
    scope: ScopeConfig;
    dataType: DataTypeConfig;
    limits: DataLimitsConfig;
    pageAccess: PageAccessConfig;
  }> {
    if (isAdmin || !roleId) return { scope: {}, dataType: {}, limits: {}, pageAccess: {} };
    // Org-scoped read (defense in depth) — a foreign-tenant roleId must never load
    // another org's config; mirrors PermissionResolverService's org guard.
    const role = await this.prisma.roleDefinition.findFirst({
      where: { id: roleId, organizationId },
      select: { scopeConfig: true, dataTypeConfig: true, dataLimits: true, pageAccess: true },
    });
    const scope = ScopeConfigSchema.safeParse(role?.scopeConfig ?? {});
    const dataType = DataTypeConfigSchema.safeParse(role?.dataTypeConfig ?? {});
    const limits = DataLimitsConfigSchema.safeParse(role?.dataLimits ?? {});
    const pageAccess = PageAccessConfigSchema.safeParse(role?.pageAccess ?? {});
    return {
      scope: scope.success ? scope.data : {},
      dataType: dataType.success ? dataType.data : {},
      limits: limits.success ? limits.data : {},
      pageAccess: pageAccess.success ? pageAccess.data : {},
    };
  }

  /**
   * The user's {@link UserAccessOverride} scope/dataType/limits config (Phase 5),
   * org-scoped. Absent/invalid ⇒ `{}` ⇒ no override (role value wins). Capabilities
   * are handled in PermissionResolverService, not here.
   */
  private async loadUserOverride(
    organizationId: string,
    userId: string,
  ): Promise<{
    scope: ScopeConfig;
    dataType: DataTypeConfig;
    limits: DataLimitsConfig;
    /** Undefined ⇒ no page-access override set ⇒ the role's pageAccess wins. */
    pageAccess?: PageAccessConfig;
  }> {
    const ov = await this.prisma.userAccessOverride.findFirst({
      where: { organizationId, userId },
      select: { scopeConfig: true, dataTypeConfig: true, dataLimits: true, pageAccess: true },
    });
    if (!ov) return { scope: {}, dataType: {}, limits: {} };
    const scope = ScopeConfigSchema.safeParse(ov.scopeConfig ?? {});
    const dataType = DataTypeConfigSchema.safeParse(ov.dataTypeConfig ?? {});
    const limits = DataLimitsConfigSchema.safeParse(ov.dataLimits ?? {});
    // pageAccess REPLACES the role wholesale only when actually set on the override —
    // a null/absent column leaves it undefined so the role's pageAccess applies.
    const pageAccessParsed =
      ov.pageAccess == null ? undefined : PageAccessConfigSchema.safeParse(ov.pageAccess);
    return {
      scope: scope.success ? scope.data : {},
      dataType: dataType.success ? dataType.data : {},
      limits: limits.success ? limits.data : {},
      pageAccess:
        pageAccessParsed && pageAccessParsed.success ? pageAccessParsed.data : undefined,
    };
  }

  /** Direct + indirect reports via the managerId chain (cycle-safe, depth-capped). */
  private async resolveReportsRecursive(orgId: string, rootUserId: string): Promise<string[]> {
    const out = new Set<string>();
    let frontier = [rootUserId];
    for (let depth = 0; depth < MAX_REPORT_DEPTH && frontier.length > 0; depth++) {
      const rows = await this.prisma.user.findMany({
        where: { organizationId: orgId, managerId: { in: frontier } },
        select: { id: true },
      });
      const next = rows
        .map((r) => r.id)
        .filter((id) => id !== rootUserId && !out.has(id));
      next.forEach((id) => out.add(id));
      frontier = next;
    }
    return [...out];
  }

  invalidate(organizationId: string, userId: string): void {
    this.cache.delete(`${organizationId}:${userId}`);
    this.unitMembersCache.delete(`${organizationId}:${userId}`);
  }

  /** Clear every cached profile — call when a role's config/permissions change. */
  invalidateAll(): void {
    this.cache.clear();
    this.unitMembersCache.clear();
  }
}
