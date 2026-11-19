import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { isCategoryAllowed } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { holderStanding } from '../user-kpis/assignment-status.js';

export interface UnitAssignmentRow {
  assignmentId: string;
  orgUnitId: string;
  name: string;
  inherited: boolean;
  inheritedFromUnitId: string | null;
  targetValue: number | null;
  currentValue: number | null;
  status: string | null;
}

export interface UserAssignmentRow {
  assignmentId: string;
  userId: string;
  name: string;
  targetValue: number | null;
  currentValue: number | null;
  status: string | null;
}

export interface KpiAssignments {
  scope: string;
  units: UnitAssignmentRow[];
  users: UserAssignmentRow[];
}

/**
 * Who a KPI is assigned to.
 *
 * A PER_UNIT or PER_USER KPI is recorded against an assignment, so the UI needs
 * to know which units or people hold it, and what each of them has recorded.
 * Nothing exposed this, so a KPI's assignments were invisible after creation
 * and per-unit values could not be recorded at all (UI-003, UI-004).
 *
 * The rows are filtered by the caller's own scope — the same rule that decides
 * which data points they may read — so a manager sees their units and an
 * individual sees only themselves.
 */
@Injectable()
export class KpiAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
  ) {}

  async listForKpi(kpiId: string): Promise<KpiAssignments> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, scope: true, categoryId: true, targetValue: true, direction: true },
    });
    // A KPI the caller cannot list has no readable assignments: 404, no
    // existence leak (the rule GET /kpis/:id/data follows).
    const allowlist = await this.accessContext.kpiCategoryAllowlist();
    if (!kpi || !isCategoryAllowed(allowlist, kpi.categoryId) || !(await this.accessContext.isKpiVisible(kpiId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }

    if (kpi.scope === 'PER_UNIT') {
      const scope = await this.accessContext.kpiPointScopeWhere('PER_UNIT');
      const rows = await this.prisma.kPIAssignmentOrgUnit.findMany({
        where: { kpiId, organizationId: ctx.organizationId, ...scope },
        select: {
          id: true,
          orgUnitId: true,
          inherited: true,
          inheritedFromUnitId: true,
          targetValue: true,
          currentValue: true,
          status: true,
          orgUnit: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return {
        scope: kpi.scope,
        units: rows.map((r) => ({
          assignmentId: r.id,
          orgUnitId: r.orgUnitId,
          name: r.orgUnit.name,
          inherited: r.inherited,
          inheritedFromUnitId: r.inheritedFromUnitId,
          // The unit's own target, or the KPI's when it has none; its status against that.
          ...holderStanding(r, kpi),
          currentValue: r.currentValue,
        })),
        users: [],
      };
    }

    if (kpi.scope === 'PER_USER') {
      const scope = await this.accessContext.kpiPointScopeWhere('PER_USER');
      const rows = await this.prisma.kPIAssignmentUser.findMany({
        where: { kpiId, organizationId: ctx.organizationId, ...scope },
        select: {
          id: true,
          userId: true,
          targetValue: true,
          currentValue: true,
          status: true,
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      return {
        scope: kpi.scope,
        units: [],
        users: rows.map((r) => ({
          assignmentId: r.id,
          userId: r.userId,
          name: r.user.fullName,
          // The person's own target, or the KPI's when they have none; their status against that.
          ...holderStanding(r, kpi),
          currentValue: r.currentValue,
        })),
      };
    }

    // ORG_WIDE: the organisation records one value; there is nothing to assign.
    return { scope: kpi.scope, units: [], users: [] };
  }
}
