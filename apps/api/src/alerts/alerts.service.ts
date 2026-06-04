import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { buildKpiVisibilityWhere, kpiContextFromProfile } from '../rbac/visibility/kpi-visibility.js';
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const alertSelect = {
  id: true,
  organizationId: true,
  alertRuleId: true,
  kpiId: true,
  message: true,
  severity: true,
  status: true,
  targetUserId: true,
  acknowledgedAt: true,
  acknowledgedById: true,
  resolvedAt: true,
  meta: true,
  createdAt: true,
} satisfies Prisma.AlertSelect;

export type PublicAlert = Prisma.AlertGetPayload<{ select: typeof alertSelect }>;

export interface ListAlertsFilter {
  status?: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH';
  kpiId?: string;
  limit?: number;
}

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessContext: AccessContextService,
  ) {}

  /**
   * Adds the always-on KPI-visibility floor (an alert is visible only if its KPI is
   * visible to the principal) plus ALERTS-scope target narrowing to an alert `where`.
   * Admin ⇒ unchanged. ORG ⇒ floor only. SELF/DIRECT_REPORTS ⇒ targetUserId IN set.
   * UNITS ⇒ targetUserId IN set OR untargeted (null) — org-wide-KPI alerts stay visible.
   */
  private async applyVisibility(where: Prisma.AlertWhereInput): Promise<Prisma.AlertWhereInput> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return where;

    // Floor: only alerts whose KPI the principal may see.
    const kpiWhere = buildKpiVisibilityWhere(
      kpiContextFromProfile(ctx.organizationId, ctx.userId, profile),
    ) as unknown as Prisma.KPIWhereInput;
    const visibleKpis = await this.prisma.kPI.findMany({ where: kpiWhere, select: { id: true } });
    const visibleIds = visibleKpis.map((k) => k.id);
    // Intersect with an explicit kpiId filter if one is already set (else the floor wins).
    if (typeof where.kpiId === 'string') {
      where.kpiId = visibleIds.includes(where.kpiId) ? where.kpiId : { in: [] };
    } else {
      where.kpiId = { in: visibleIds };
    }

    // Scope: narrow by targetUserId.
    const scope = profile.scopeByDomain.ALERTS ?? 'ORG';
    if (scope === 'UNITS') {
      const ids = scopedUserIds('UNITS', {
        userId: ctx.userId,
        directReportIds: profile.context.directReportIds,
        unitMemberUserIds: await this.accessContext.unitMemberUserIds(),
      })!;
      where.OR = [{ targetUserId: { in: ids } }, { targetUserId: null }];
    } else if (scope === 'SELF' || scope === 'DIRECT_REPORTS') {
      const ids = scopedUserIds(scope, {
        userId: ctx.userId,
        directReportIds: profile.context.directReportIds,
        unitMemberUserIds: [],
      })!;
      where.targetUserId = { in: ids };
    }
    // ORG ⇒ floor only, no targetUserId narrowing.
    return where;
  }

  async list(filter: ListAlertsFilter = {}): Promise<PublicAlert[]> {
    const ctx = RequestContextStore.require();
    let where: Prisma.AlertWhereInput = { organizationId: ctx.organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.severity) where.severity = filter.severity;
    if (filter.kpiId) where.kpiId = filter.kpiId;
    where = await this.applyVisibility(where);
    return this.prisma.alert.findMany({
      where,
      select: alertSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(filter.limit ?? 100, 500),
    });
  }

  async getById(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    const where = await this.applyVisibility({ organizationId: ctx.organizationId, id } as Prisma.AlertWhereInput);
    const alert = await this.prisma.alert.findFirst({ where, select: alertSelect });
    if (!alert) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Alert not found' });
    }
    return alert;
  }

  async acknowledge(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    await this.getById(id);
    await this.prisma.alert.updateMany({
      where: { id, organizationId: ctx.organizationId, status: 'OPEN' },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: ctx.userId },
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Alert', entityId: id, metadata: { status: 'ACKNOWLEDGED' } });
    return this.getById(id);
  }

  async resolve(id: string): Promise<PublicAlert> {
    const ctx = RequestContextStore.require();
    await this.getById(id);
    await this.prisma.alert.updateMany({
      where: { id, organizationId: ctx.organizationId, status: { not: 'RESOLVED' } },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Alert', entityId: id, metadata: { status: 'RESOLVED' } });
    return this.getById(id);
  }

  async unreadCount(): Promise<number> {
    const ctx = RequestContextStore.require();
    const where = await this.applyVisibility({ organizationId: ctx.organizationId, status: 'OPEN' } as Prisma.AlertWhereInput);
    return this.prisma.alert.count({ where });
  }
}
