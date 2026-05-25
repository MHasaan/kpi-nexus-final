import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildKpiVisibilityWhere } from '../rbac/visibility/kpi-visibility.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { RecordDataPointDto } from './dto/record-data-point.dto.js';

const dataPointSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  orgUnitId: true,
  userId: true,
  value: true,
  unit: true,
  periodStart: true,
  periodEnd: true,
  recordedAt: true,
  recordedById: true,
  sourceType: true,
  sourceRef: true,
  qualityFlag: true,
  note: true,
} satisfies Prisma.KPIDataPointSelect;

export type PublicDataPoint = Prisma.KPIDataPointGetPayload<{
  select: typeof dataPointSelect;
}>;

/**
 * Handles writes + reads of KPIDataPoint rows. Spec §6 routes per scope:
 *
 *   ORG_WIDE → POST /kpis/:id/data
 *   PER_UNIT → POST /org-units/kpi-assignments/:assignmentId/data
 *   PER_USER → POST /user-kpis/my-kpis/:assignmentId/data
 *
 * Posting to the wrong endpoint for a KPI's scope returns 422 with the
 * correct endpoint name in `details.correctEndpoint`. The 422 is critical
 * for surfacing the original-app bug class where users could record into
 * mismatched scopes.
 */
@Injectable()
export class KpiDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PermissionResolverService,
  ) {}

  /** POST /kpis/:id/data — ORG_WIDE only. */
  async recordForOrgWideKpi(
    kpiId: string,
    dto: RecordDataPointDto,
  ): Promise<PublicDataPoint> {
    const ctx = RequestContextStore.require();
    const kpi = await this.requireKpiInTenant(kpiId);

    if (kpi.scope !== 'ORG_WIDE') {
      throw new UnprocessableEntityException({
        code: 'SCOPE_MISMATCH',
        message: `This KPI has scope ${kpi.scope}. POST /kpis/:id/data is only valid for ORG_WIDE.`,
        details: {
          scope: kpi.scope,
          correctEndpoint:
            kpi.scope === 'PER_UNIT'
              ? '/org-units/kpi-assignments/:assignmentId/data'
              : '/user-kpis/my-kpis/:assignmentId/data',
        },
      });
    }

    return this.insertDataPoint({
      organizationId: ctx.organizationId,
      kpiId,
      orgUnitId: null,
      userId: null,
      recordedById: ctx.userId,
      dto,
    });
  }

  /** POST /org-units/kpi-assignments/:assignmentId/data — PER_UNIT only. */
  async recordForOrgUnitAssignment(
    assignmentId: string,
    dto: RecordDataPointDto,
  ): Promise<PublicDataPoint> {
    const ctx = RequestContextStore.require();
    const assignment = await this.prisma.kPIAssignmentOrgUnit.findFirst({
      where: { id: assignmentId, organizationId: ctx.organizationId },
      select: { kpiId: true, orgUnitId: true, kpi: { select: { scope: true } } },
    });
    if (!assignment) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'OrgUnit KPI assignment not found',
      });
    }
    if (assignment.kpi.scope !== 'PER_UNIT') {
      throw new UnprocessableEntityException({
        code: 'SCOPE_MISMATCH',
        message: `This KPI has scope ${assignment.kpi.scope}. /org-units/kpi-assignments is only for PER_UNIT.`,
        details: {
          scope: assignment.kpi.scope,
          correctEndpoint:
            assignment.kpi.scope === 'ORG_WIDE'
              ? '/kpis/:id/data'
              : '/user-kpis/my-kpis/:assignmentId/data',
        },
      });
    }

    return this.insertDataPoint({
      organizationId: ctx.organizationId,
      kpiId: assignment.kpiId,
      orgUnitId: assignment.orgUnitId,
      userId: null,
      recordedById: ctx.userId,
      dto,
    });
  }

  /** POST /user-kpis/my-kpis/:assignmentId/data — PER_USER, current user only. */
  async recordForMyUserAssignment(
    assignmentId: string,
    dto: RecordDataPointDto,
  ): Promise<PublicDataPoint> {
    const ctx = RequestContextStore.require();
    const assignment = await this.prisma.kPIAssignmentUser.findFirst({
      where: { id: assignmentId, organizationId: ctx.organizationId },
      select: { kpiId: true, userId: true, kpi: { select: { scope: true } } },
    });
    if (!assignment) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User KPI assignment not found',
      });
    }
    if (assignment.kpi.scope !== 'PER_USER') {
      throw new UnprocessableEntityException({
        code: 'SCOPE_MISMATCH',
        message: `This KPI has scope ${assignment.kpi.scope}. /user-kpis/my-kpis is only for PER_USER.`,
        details: {
          scope: assignment.kpi.scope,
          correctEndpoint:
            assignment.kpi.scope === 'ORG_WIDE'
              ? '/kpis/:id/data'
              : '/org-units/kpi-assignments/:assignmentId/data',
        },
      });
    }
    // Critical §6 invariant: a user can only record data for their OWN
    // assignment. This is the bug class the original app had — user A
    // could record into user B's slot. Defense-in-depth: the endpoint
    // path implies "my", but we double-check the userId here.
    if (assignment.userId !== ctx.userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You can only record data for your own KPI assignment',
      });
    }

    return this.insertDataPoint({
      organizationId: ctx.organizationId,
      kpiId: assignment.kpiId,
      orgUnitId: null,
      userId: assignment.userId,
      recordedById: ctx.userId,
      dto,
    });
  }

  /** GET /kpis/:id/data — visibility-filtered. */
  async listForKpi(
    kpiId: string,
    opts: { from?: Date; to?: Date; limit?: number } = {},
  ): Promise<PublicDataPoint[]> {
    const ctx = RequestContextStore.require();
    const kpi = await this.requireKpiInTenant(kpiId);

    const where: Prisma.KPIDataPointWhereInput = {
      organizationId: ctx.organizationId,
      kpiId,
    };
    if (opts.from) where.periodStart = { gte: opts.from };
    if (opts.to) where.periodEnd = { lte: opts.to };

    // For PER_USER + PER_UNIT KPIs, non-admin principals can only see
    // points scoped to themselves / their units / direct reports.
    const visibility = await this.buildVisibilityContext();
    if (!visibility.isAdmin) {
      if (kpi.scope === 'PER_USER') {
        const allowedUsers = [visibility.userId, ...visibility.directReportIds];
        where.userId = { in: allowedUsers };
      } else if (kpi.scope === 'PER_UNIT') {
        const allowedUnits = [
          ...visibility.managedOrgUnitIds,
          ...visibility.memberOrgUnitIds,
        ];
        where.orgUnitId = allowedUnits.length > 0 ? { in: allowedUnits } : { in: [] };
      }
    }

    return this.prisma.kPIDataPoint.findMany({
      where,
      select: dataPointSelect,
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      take: Math.min(opts.limit ?? 1000, 5000),
    });
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  private async requireKpiInTenant(kpiId: string) {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, scope: true, allowNegative: true },
    });
    if (!kpi) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    return kpi;
  }

  private async insertDataPoint(params: {
    organizationId: string;
    kpiId: string;
    orgUnitId: string | null;
    userId: string | null;
    recordedById: string;
    dto: RecordDataPointDto;
  }): Promise<PublicDataPoint> {
    if (!params.dto || params.dto.value === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'value is required',
      });
    }
    const point = await this.prisma.kPIDataPoint.create({
      data: {
        organizationId: params.organizationId,
        kpiId: params.kpiId,
        orgUnitId: params.orgUnitId,
        userId: params.userId,
        recordedById: params.recordedById,
        value: params.dto.value,
        unit: params.dto.unit,
        periodStart: params.dto.periodStart,
        periodEnd: params.dto.periodEnd,
        sourceType: params.dto.sourceType,
        sourceRef: params.dto.sourceRef,
        qualityFlag: params.dto.qualityFlag,
        note: params.dto.note,
      },
      select: dataPointSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'KPIDataPoint',
      entityId: point.id,
      metadata: {
        kpiId: point.kpiId,
        value: point.value,
        scope:
          point.userId !== null
            ? 'PER_USER'
            : point.orgUnitId !== null
              ? 'PER_UNIT'
              : 'ORG_WIDE',
      },
    });
    return point;
  }

  private async buildVisibilityContext() {
    const ctx = RequestContextStore.require();
    const resolved = await this.resolver.resolveForUser(
      ctx.organizationId,
      ctx.userId,
      ctx.roleId,
    );
    if (resolved.isAdmin) {
      return {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        isAdmin: true,
        managedOrgUnitIds: [],
        memberOrgUnitIds: [],
        directReportIds: [],
      };
    }
    const memberships = await this.prisma.orgUnitMember.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, leftAt: null },
      select: { orgUnitId: true, memberRole: true },
    });
    const managedOrgUnitIds: string[] = [];
    const memberOrgUnitIds: string[] = [];
    for (const m of memberships) {
      if (m.memberRole === 'MANAGER' || m.memberRole === 'LEAD') {
        managedOrgUnitIds.push(m.orgUnitId);
      } else {
        memberOrgUnitIds.push(m.orgUnitId);
      }
    }
    const directReports = await this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId, managerId: ctx.userId },
      select: { id: true },
    });
    return {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      isAdmin: false,
      managedOrgUnitIds,
      memberOrgUnitIds,
      directReportIds: directReports.map((u) => u.id),
    };
  }
}
