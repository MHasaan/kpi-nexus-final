import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS } from '@kpi-nexus/contracts';
import type { AccessProfile, Domain, Scope } from '@kpi-nexus/contracts';

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

    // Phase-1 derived default scope = today's behaviour. Admin ⇒ ORG everywhere;
    // a manager (managed units) ⇒ UNITS; an individual ⇒ DIRECT_REPORTS (covers self +
    // reports for PER_USER). Later phases replace this with role/user scopeConfig.
    const defaultScope: Scope = isAdmin
      ? 'ORG'
      : managedOrgUnitIds.length > 0
        ? 'UNITS'
        : 'DIRECT_REPORTS';
    const scopeByDomain = Object.fromEntries(
      DOMAINS.map((d) => [d, isAdmin ? 'ORG' : defaultScope]),
    ) as Record<Domain, Scope>;

    const profile: AccessProfile = {
      isAdmin,
      capabilities,
      scopeByDomain,
      dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
      dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
      context: { managedOrgUnitIds, memberOrgUnitIds, directReportIds },
    };
    this.cache.set(key, { profile, at: Date.now() });
    return profile;
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
}
