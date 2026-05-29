import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { AlertEngineProducer } from '../alert-engine/alert-engine.producer.js';
import { CalculationEngineProducer } from '../calculation-engine/calculation-engine.producer.js';
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
/** Aggregate a list of data-point values using the KPI's aggregation method. */
function aggregate(values: number[], method: string): number | null {
  if (values.length === 0) return null;
  switch (method) {
    case 'SUM':
    case 'COUNT':
    case 'COUNT_DISTINCT':
      return values.reduce((a, b) => a + b, 0);
    case 'AVG':
    case 'MEDIAN':
      if (method === 'MEDIAN') {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1]! + sorted[mid]!) / 2
          : sorted[mid]!;
      }
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'MIN':
      return Math.min(...values);
    case 'MAX':
      return Math.max(...values);
    case 'LAST':
      return values[0] ?? null; // values arrive sorted by recordedAt DESC
    case 'FIRST':
      return values[values.length - 1] ?? null;
    default:
      return values[0] ?? null;
  }
}

@Injectable()
export class KpiDataService {
  private readonly logger = new Logger(KpiDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PermissionResolverService,
    private readonly realtime: RealtimeService,
    private readonly alertEngine: AlertEngineProducer,
    private readonly calcEngine: CalculationEngineProducer,
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

  /**
   * GET /kpis/dashboard-summary — one row per visible KPI with the most-recent
   * value in the window and an aggregated value over the window (using the
   * KPI's own aggregationMethod). Designed for the P3 dashboard.
   *
   * One query per KPI to pull data points. For large KPI counts this is
   * acceptable in dev (single-digit ms each on the hypertable). When the
   * dashboard moves to streamed widgets in P3 we'll switch to a single
   * grouped aggregate query.
   */
  async dashboardSummary(opts: { from?: Date; to?: Date } = {}): Promise<
    Array<{
      kpiId: string;
      name: string;
      scope: 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER';
      unit: string | null;
      targetValue: number | null;
      latestValue: number | null;
      latestRecordedAt: Date | null;
      aggregatedValue: number | null;
      pointCount: number;
    }>
  > {
    const ctx = RequestContextStore.require();
    const visibility = await this.buildVisibilityContext();
    const visibleKpis = await this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        scope: true,
        unit: true,
        targetValue: true,
        aggregationMethod: true,
      },
    });

    // Apply the same visibility logic the list endpoint uses
    const filtered = await this.filterByVisibility(visibleKpis, visibility);

    // For each visible KPI, pull data points in the window (or last 1000
    // if no window given) and compute latest + aggregated.
    const result = await Promise.all(
      filtered.map(async (kpi) => {
        const where: Prisma.KPIDataPointWhereInput = {
          organizationId: ctx.organizationId,
          kpiId: kpi.id,
        };
        if (opts.from) where.periodStart = { gte: opts.from };
        if (opts.to) where.periodEnd = { lte: opts.to };
        // Apply scope-specific visibility on data points themselves
        if (!visibility.isAdmin) {
          if (kpi.scope === 'PER_USER') {
            where.userId = {
              in: [visibility.userId, ...visibility.directReportIds],
            };
          } else if (kpi.scope === 'PER_UNIT') {
            const units = [
              ...visibility.managedOrgUnitIds,
              ...visibility.memberOrgUnitIds,
            ];
            where.orgUnitId = units.length > 0 ? { in: units } : { in: [] };
          }
        }

        const points = await this.prisma.kPIDataPoint.findMany({
          where,
          select: { value: true, recordedAt: true, periodStart: true },
          orderBy: [{ recordedAt: 'desc' }],
          take: 1000,
        });
        return {
          kpiId: kpi.id,
          name: kpi.name,
          scope: kpi.scope,
          unit: kpi.unit,
          targetValue: kpi.targetValue,
          latestValue: points[0]?.value ?? null,
          latestRecordedAt: points[0]?.recordedAt ?? null,
          aggregatedValue: aggregate(points.map((p) => p.value), kpi.aggregationMethod),
          pointCount: points.length,
        };
      }),
    );
    return result;
  }

  private async filterByVisibility<
    T extends { id: string; scope: 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER' },
  >(
    kpis: T[],
    visibility: Awaited<ReturnType<KpiDataService['buildVisibilityContext']>>,
  ): Promise<T[]> {
    if (visibility.isAdmin) return kpis;

    // For PER_UNIT/PER_USER, check that the KPI has at least one assignment
    // within the user's allowed scope. ORG_WIDE is always visible.
    const candidatePerUnit = kpis.filter((k) => k.scope === 'PER_UNIT').map((k) => k.id);
    const candidatePerUser = kpis.filter((k) => k.scope === 'PER_USER').map((k) => k.id);

    const allowedUnits = new Set([
      ...visibility.managedOrgUnitIds,
      ...visibility.memberOrgUnitIds,
    ]);
    const allowedUsers = new Set([
      visibility.userId,
      ...visibility.directReportIds,
    ]);

    const perUnitVisible = new Set<string>();
    if (candidatePerUnit.length > 0 && allowedUnits.size > 0) {
      const rows = await this.prisma.kPIAssignmentOrgUnit.findMany({
        where: {
          kpiId: { in: candidatePerUnit },
          orgUnitId: { in: Array.from(allowedUnits) },
        },
        select: { kpiId: true },
      });
      for (const r of rows) perUnitVisible.add(r.kpiId);
    }
    const perUserVisible = new Set<string>();
    if (candidatePerUser.length > 0) {
      const rows = await this.prisma.kPIAssignmentUser.findMany({
        where: {
          kpiId: { in: candidatePerUser },
          userId: { in: Array.from(allowedUsers) },
        },
        select: { kpiId: true },
      });
      for (const r of rows) perUserVisible.add(r.kpiId);
    }

    return kpis.filter(
      (k) =>
        k.scope === 'ORG_WIDE' ||
        (k.scope === 'PER_UNIT' && perUnitVisible.has(k.id)) ||
        (k.scope === 'PER_USER' && perUserVisible.has(k.id)),
    );
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

    // Publish realtime event — non-fatal: a Redis hiccup must not fail the write.
    try {
      await this.realtime.publish(params.organizationId, {
        type: 'data_point_added',
        kpiId: point.kpiId,
        dataPointId: point.id,
        value: point.value,
        recordedAt: point.recordedAt.toISOString(),
        orgUnitId: point.orgUnitId,
        userId: point.userId,
      });
    } catch (err) {
      this.logger.warn(
        `KpiDataService: realtime publish failed for dataPoint ${point.id}: ${String(err)}`,
      );
    }

    // Enqueue alert evaluation (fire-and-forget; producer swallows errors).
    await this.alertEngine.enqueueEvaluateKpi({
      organizationId: params.organizationId,
      kpiId: point.kpiId,
      dataPointId: point.id,
      value: point.value,
      recordedAt: point.recordedAt.toISOString(),
      targetUserId: point.userId,
    });

    // Reactive recompute pipeline (fire-and-forget). COMPUTED points are written
    // by the calc engine via direct Prisma writes (never through this path), so
    // the guard below prevents re-entry / infinite loops.
    if (point.sourceType !== 'COMPUTED') {
      await this.enqueueDerivedRecomputes(point.kpiId, point.periodStart, point.periodEnd, params.organizationId);
    }

    return point;
  }

  /**
   * Enqueue cascade rollups for every parent of `kpiId` and recomputes for every
   * formula KPI that references it. Fire-and-forget; never throws into the write.
   */
  private async enqueueDerivedRecomputes(
    kpiId: string,
    periodStart: Date,
    periodEnd: Date,
    organizationId: string,
  ): Promise<void> {
    try {
      const [parents, dependents] = await Promise.all([
        this.prisma.kPICascade.findMany({
          where: { childKpiId: kpiId, organizationId },
          select: { parentKpiId: true },
        }),
        this.prisma.kPIDependency.findMany({
          where: { sourceKpiId: kpiId, organizationId },
          select: { dependentKpiId: true },
        }),
      ]);
      for (const p of parents) {
        await this.calcEngine.enqueueCascadeRollup({
          organizationId,
          parentKpiId: p.parentKpiId,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }
      for (const d of dependents) {
        await this.calcEngine.enqueueRecompute({ organizationId, kpiId: d.dependentKpiId });
      }
    } catch (err) {
      this.logger.warn(`enqueueDerivedRecomputes failed for kpi ${kpiId}: ${String(err)}`);
    }
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
