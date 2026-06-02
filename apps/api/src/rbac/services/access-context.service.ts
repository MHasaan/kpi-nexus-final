import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, DataTypeConfigSchema, ScopeConfigSchema } from '@kpi-nexus/contracts';
import type {
  AccessProfile,
  DataTypeConfig,
  Domain,
  Scope,
  ScopeConfig,
} from '@kpi-nexus/contracts';

import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
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

    // Derived default scope. Admin ⇒ ORG everywhere. For a non-admin the default is
    // UNITS — its visibility mapping (managed∪member units + self∪reports) reproduces
    // today's behaviour exactly, so an unset scopeConfig stays at parity. Phase 2:
    // the role's per-domain scopeConfig overrides this default; narrower values
    // (DIRECT_REPORTS/SELF) actually restrict, ORG widens.
    const defaultScope: Scope = isAdmin ? 'ORG' : 'UNITS';
    const roleConfig = await this.loadRoleConfig(isAdmin, ctx.roleId);
    const scopeByDomain = Object.fromEntries(
      DOMAINS.map((d) => [d, isAdmin ? 'ORG' : (roleConfig.scope[d] ?? defaultScope)]),
    ) as Record<Domain, Scope>;

    const profile: AccessProfile = {
      isAdmin,
      capabilities,
      scopeByDomain,
      // Layer 3 — admins unrestricted; non-admins inherit the role's category allowlist
      // (Phase 3). orgUnitIds/dashboardIds enforcement is deferred (stay null).
      dataTypeFilters: {
        kpiCategoryIds: roleConfig.dataType.kpiCategoryIds ?? null,
        orgUnitIds: null,
        dashboardIds: null,
      },
      dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
      context: { managedOrgUnitIds, memberOrgUnitIds, directReportIds },
    };
    this.cache.set(key, { profile, at: Date.now() });
    return profile;
  }

  /**
   * The direct role's `scopeConfig` (Phase 2, Layer 2) + `dataTypeConfig` (Phase 3,
   * Layer 3), fetched together. Admins skip it (always ORG / unrestricted). Inherited-
   * role merge is deferred (Phase 5). Invalid/absent JSON ⇒ `{}` ⇒ defaults/parity.
   */
  private async loadRoleConfig(
    isAdmin: boolean,
    roleId: string | null,
  ): Promise<{ scope: ScopeConfig; dataType: DataTypeConfig }> {
    if (isAdmin || !roleId) return { scope: {}, dataType: {} };
    const role = await this.prisma.roleDefinition.findUnique({
      where: { id: roleId },
      select: { scopeConfig: true, dataTypeConfig: true },
    });
    const scope = ScopeConfigSchema.safeParse(role?.scopeConfig ?? {});
    const dataType = DataTypeConfigSchema.safeParse(role?.dataTypeConfig ?? {});
    return {
      scope: scope.success ? scope.data : {},
      dataType: dataType.success ? dataType.data : {},
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
  }

  /** Clear every cached profile — call when a role's config/permissions change. */
  invalidateAll(): void {
    this.cache.clear();
  }
}
