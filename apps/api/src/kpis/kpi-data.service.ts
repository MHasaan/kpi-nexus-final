import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type KpiHolders, PermissionKey, holdersHealth } from '@kpi-nexus/contracts';
import type { KPIDataPointHistory, Prisma } from '@kpi-nexus/db';

import { WorkflowsService } from '../workflows/workflows.service.js';
import { KpiWatchProducer } from '../kpi-watches/kpi-watch.producer.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import {
  buildKpiVisibilityWhere,
  clampTake,
  kpiContextFromProfile,
  kpiDataPointScopeWhere,
  type KpiVisibilityContext,
} from '../rbac/visibility/kpi-visibility.js';
import { periodWindowWhere } from './period-window.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { AlertEngineProducer } from '../alert-engine/alert-engine.producer.js';
import { CalculationEngineProducer } from '../calculation-engine/calculation-engine.producer.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { detectOutlier } from './outlier-detector.js';
import { holderStanding } from '../user-kpis/assignment-status.js';
import type { CorrectDataPointDto } from './dto/correct-data-point.dto.js';
import type { RecordDataPointDto } from './dto/record-data-point.dto.js';
import { type KpiHealthStatus, attainmentPct, kpiHealthStatus } from './kpi-health.js';

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
  isOutlier: true,
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
      return values[0] ?? null; // values arrive newest period first (periodStart DESC)
    case 'FIRST':
      return values[values.length - 1] ?? null;
    default:
      return values[0] ?? null;
  }
}

/** How many periods a dashboard-summary row carries for its sparkline. */
const SPARK_POINTS = 12;

@Injectable()
export class KpiDataService {
  private readonly logger = new Logger(KpiDataService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessContext: AccessContextService,
    private readonly realtime: RealtimeService,
    private readonly alertEngine: AlertEngineProducer,
    private readonly calcEngine: CalculationEngineProducer,
    @Optional() private readonly workflows?: WorkflowsService,
    @Optional() private readonly watches?: KpiWatchProducer,
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
      // API-key principals carry the key id as userId (not a real User row);
      // leave recordedById null so the FK holds for connector/ingest writes.
      recordedById: ctx.principalType === 'api_key' ? null : ctx.userId,
      dto,
    });
  }

  /**
   * Bulk-ingest ORG_WIDE data points (connectors, webhook ingest). Each row is
   * recorded through the normal single-row path (so outlier/alert/workflow
   * fan-out still fires); per-row failures are collected so the caller can mark
   * a job PARTIAL rather than aborting the whole batch.
   */
  async bulkRecordOrgWide(
    rows: Array<{ kpiId: string; value: number; recordedAt?: Date; sourceType?: 'INGESTION' | 'INTEGRATION'; sourceRef?: string }>,
  ): Promise<{ succeeded: number; failed: number; errors: string[] }> {
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const at = row.recordedAt ?? new Date();
      try {
        await this.recordForOrgWideKpi(row.kpiId, {
          value: row.value,
          periodStart: at,
          periodEnd: at,
          sourceType: row.sourceType ?? 'INGESTION',
          sourceRef: row.sourceRef,
          qualityFlag: 'HIGH',
        });
        succeeded++;
      } catch (err) {
        failed++;
        if (errors.length < 50) errors.push(`${row.kpiId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { succeeded, failed, errors };
  }

  /** POST /org-units/kpi-assignments/:assignmentId/data — PER_UNIT only. */
  async recordForOrgUnitAssignment(
    assignmentId: string,
    dto: RecordDataPointDto,
  ): Promise<PublicDataPoint> {
    const ctx = RequestContextStore.require();
    const assignment = await this.prisma.kPIAssignmentOrgUnit.findFirst({
      where: { id: assignmentId, organizationId: ctx.organizationId },
      select: {
        id: true,
        kpiId: true,
        orgUnitId: true,
        targetValue: true,
        kpi: { select: { scope: true, direction: true, targetValue: true } },
      },
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

    // KPI_DATA_ENTRY says the principal may record; the KPIS scope says for
    // WHOM. Without this, anyone holding the permission could write a value for
    // any unit in the org, including units they cannot even read (UI-003).
    const scope = await this.accessContext.kpiPointScopeWhere('PER_UNIT');
    if (scope.orgUnitId && !scope.orgUnitId.in.includes(assignment.orgUnitId)) {
      throw new ForbiddenException({
        code: 'UNIT_NOT_IN_SCOPE',
        message: 'You can only record values for a unit you manage or belong to',
      });
    }

    const point = await this.insertDataPoint({
      organizationId: ctx.organizationId,
      kpiId: assignment.kpiId,
      orgUnitId: assignment.orgUnitId,
      userId: null,
      recordedById: ctx.userId,
      dto,
    });
    // Against the holder's own target, or the KPI's when they have none of their own.
    const { status } = holderStanding({ targetValue: assignment.targetValue, currentValue: point.value }, assignment.kpi);
    await this.prisma.kPIAssignmentOrgUnit.update({
      where: { id: assignment.id },
      data: { currentValue: point.value, status },
    });
    return point;
  }

  /** POST /user-kpis/my-kpis/:assignmentId/data — PER_USER, current user only. */
  async recordForMyUserAssignment(
    assignmentId: string,
    dto: RecordDataPointDto,
  ): Promise<PublicDataPoint> {
    const ctx = RequestContextStore.require();
    const assignment = await this.prisma.kPIAssignmentUser.findFirst({
      where: { id: assignmentId, organizationId: ctx.organizationId },
      select: {
        id: true,
        kpiId: true,
        userId: true,
        targetValue: true,
        kpi: { select: { scope: true, direction: true, targetValue: true } },
      },
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

    const point = await this.insertDataPoint({
      organizationId: ctx.organizationId,
      kpiId: assignment.kpiId,
      orgUnitId: null,
      userId: assignment.userId,
      recordedById: ctx.userId,
      dto,
    });

    // Refresh the assignment's denormalized current value + progress status.
    // Against the holder's own target, or the KPI's when they have none of their own.
    const { status } = holderStanding({ targetValue: assignment.targetValue, currentValue: point.value }, assignment.kpi);
    await this.prisma.kPIAssignmentUser.update({
      where: { id: assignment.id },
      data: { currentValue: point.value, status },
    });
    return point;
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
      scorecardQuadrant: string | null;
      direction: string;
      /** Server-computed health (bands → thresholds → direction-aware target). */
      status: KpiHealthStatus;
      /** Direction-aware % of target achieved, or null. */
      attainmentPct: number | null;
      /** The last periods oldest-first, for a sparkline. */
      spark: number[];
      /**
       * Set for a per-person or per-unit KPI when the caller sees more than one holder
       * (UI-018): how many there are and how many are on track. The row then carries no
       * single value — `latestValue`, `aggregatedValue`, `attainmentPct` are null and
       * `spark` is empty — because "the latest" would be whichever holder recorded last.
       * Null for an organisation-wide KPI, and for a holder looking at their own.
       */
      holders: KpiHolders | null;
    }>
  > {
    const ctx = RequestContextStore.require();
    const visibility = await this.buildVisibilityContext();
    const limits = await this.accessContext.dataLimits();
    const window = periodWindowWhere(opts, limits.historyWindowDays);
    // The exact rule GET /kpis lists by (scope + assignments + category) — the
    // summary used a looser copy that ignored the KPIS scope (BE-003).
    const filtered = await this.prisma.kPI.findMany({
      where: { ...buildKpiVisibilityWhere(visibility), deletedAt: null } as Prisma.KPIWhereInput,
      select: {
        id: true,
        name: true,
        scope: true,
        unit: true,
        targetValue: true,
        aggregationMethod: true,
        scorecardQuadrant: true,
        direction: true,
        warningThreshold: true,
        criticalThreshold: true,
      },
    });


    // Threshold bands for every visible KPI in one query (feeds status).
    const bandRows = filtered.length
      ? await this.prisma.kPIThresholdBand.findMany({
          where: { organizationId: ctx.organizationId, kpiId: { in: filtered.map((k) => k.id) } },
          select: { kpiId: true, name: true, lower: true, upper: true, color: true, order: true, consecutivePointsRequired: true },
        })
      : [];
    const bandsByKpi = new Map<string, typeof bandRows>();
    for (const b of bandRows) bandsByKpi.set(b.kpiId, [...(bandsByKpi.get(b.kpiId) ?? []), b]);

    // Holders of the per-person and per-unit KPIs, within what the caller may see — two queries
    // for the whole list. They decide whether a KPI's row may carry a single value (UI-018).
    const holdersByKpi = new Map<string, KpiHolders>();
    const kpiById = new Map(filtered.map((k) => [k.id, k]));
    const countHolder = (row: { kpiId: string; currentValue: number | null; targetValue: number | null }) => {
      const h = holdersByKpi.get(row.kpiId) ?? { total: 0, withValue: 0, withTarget: 0, onTrack: 0 };
      h.total += 1;
      if (row.currentValue !== null) h.withValue += 1;
      // Measured against the holder's own target, or the KPI's: a target set only on the KPI used to
      // leave every holder with no status, so nobody was ever counted on track.
      const kpi = kpiById.get(row.kpiId);
      const standing = kpi ? holderStanding(row, kpi) : null;
      // With no target anywhere, a holder is neither on nor off track: counted apart, so the KPI is
      // not called "off track" for lacking one.
      if (standing && standing.targetValue !== null) h.withTarget += 1;
      const status = standing?.status ?? null;
      if (status === 'on_track' || status === 'exceeded') h.onTrack += 1;
      holdersByKpi.set(row.kpiId, h);
    };
    const idsOf = (scope: string) => filtered.filter((k) => k.scope === scope).map((k) => k.id);
    const perUserIds = idsOf('PER_USER');
    const perUnitIds = idsOf('PER_UNIT');
    const holderSelect = { kpiId: true, currentValue: true, targetValue: true } as const;
    if (perUserIds.length > 0) {
      const rows = await this.prisma.kPIAssignmentUser.findMany({
        where: { organizationId: ctx.organizationId, kpiId: { in: perUserIds }, ...kpiDataPointScopeWhere('PER_USER', visibility) },
        select: holderSelect,
      });
      rows.forEach(countHolder);
    }
    if (perUnitIds.length > 0) {
      const rows = await this.prisma.kPIAssignmentOrgUnit.findMany({
        where: { organizationId: ctx.organizationId, kpiId: { in: perUnitIds }, ...kpiDataPointScopeWhere('PER_UNIT', visibility) },
        select: holderSelect,
      });
      rows.forEach(countHolder);
    }

    // For each visible KPI, pull data points in the window (or last 1000
    // if no window given) and compute latest + aggregated.
    const result = await Promise.all(
      filtered.map(async (kpi) => {
        const where: Prisma.KPIDataPointWhereInput = {
          organizationId: ctx.organizationId,
          kpiId: kpi.id,
        };
        // A period counts as in the window when it OVERLAPS it; historyWindowDays
        // still bounds how far back the principal may aggregate (UI-002).
        Object.assign(where, window);
        // Only the points the KPIS scope reaches (self / reports / units).
        Object.assign(where, kpiDataPointScopeWhere(kpi.scope, visibility));

        const points = await this.prisma.kPIDataPoint.findMany({
          where,
          // maxListRows is NOT applied here: these points feed aggregatedValue
          // (SUM/AVG/…); capping the input would silently distort the aggregate.
          // historyWindowDays IS applied (via windowFrom) — it legitimately bounds
          // how old the data the principal may aggregate is. maxListRows governs the
          // raw data-point LIST endpoint (listForKpi), not this computed summary.
          select: { value: true, recordedAt: true, periodStart: true },
          // Newest period first: "latest" is the newest period, so a backfilled
          // older period never becomes the current value. Entry time breaks ties.
          orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
          take: 1000,
        });
        // Several holders in sight: no single value stands for the KPI. Count them instead.
        const counted = holdersByKpi.get(kpi.id);
        if (counted && counted.total > 1) {
          return {
            kpiId: kpi.id,
            name: kpi.name,
            scope: kpi.scope,
            unit: kpi.unit,
            targetValue: null,
            latestValue: null,
            latestRecordedAt: points[0]?.recordedAt ?? null,
            aggregatedValue: null,
            pointCount: points.length,
            scorecardQuadrant: kpi.scorecardQuadrant,
            direction: kpi.direction,
            status: holdersHealth(counted) as KpiHealthStatus,
            attainmentPct: null,
            spark: [] as number[],
            holders: counted as KpiHolders | null,
          };
        }
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
          scorecardQuadrant: kpi.scorecardQuadrant,
          direction: kpi.direction,
          status: kpiHealthStatus({
            recentValues: points.slice(0, 10).map((p) => p.value),
            meta: kpi,
            bands: bandsByKpi.get(kpi.id) ?? [],
          }),
          attainmentPct: attainmentPct(points[0]?.value ?? null, kpi.targetValue, kpi.direction),
          // The last periods oldest-first, for a sparkline. `points` is newest
          // first, so take from the front and reverse.
          spark: points.slice(0, SPARK_POINTS).map((p) => p.value).reverse(),
          holders: null as KpiHolders | null,
        };
      }),
    );
    return result;
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
    // A period counts as in the window when it OVERLAPS it; the Layer-4
    // historyWindowDays floor still bounds how far back we read (UI-002).
    const limits = await this.accessContext.dataLimits();
    Object.assign(where, periodWindowWhere(opts, limits.historyWindowDays));

    // Same rule as GET /kpis (scope + assignments + category): a KPI you can't
    // list has no readable data — 404, no existence leak (BE-003).
    if (!(await this.accessContext.isKpiVisible(kpiId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    // …and only the points the KPIS scope reaches (self / reports / units).
    Object.assign(where, kpiDataPointScopeWhere(kpi.scope, await this.buildVisibilityContext()));

    return this.prisma.kPIDataPoint.findMany({
      where,
      select: dataPointSelect,
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      // Layer-4: cap the row count by maxListRows (null ⇒ the existing 5000 cap = parity).
      take: clampTake(Math.min(opts.limit ?? 1000, 5000), limits.maxListRows),
    });
  }

  /**
   * PATCH /kpis/:id/data/:pointId — correct a recorded value and/or its note.
   * Only a point the caller can read (KPI visible + point scope) is found;
   * then only its recorder or a KPI_EDIT holder may change it. The old and new
   * values are kept in KPIDataPointHistory with the reason, and what a new
   * value triggers runs again (audit, live update, alerts, derived KPIs).
   */
  async correctDataPoint(kpiId: string, pointId: string, dto: CorrectDataPointDto): Promise<PublicDataPoint> {
    const ctx = RequestContextStore.require();
    const point = await this.requireReadablePoint(kpiId, pointId);
    if (point.sourceType === 'COMPUTED') {
      throw new ConflictException({ code: 'COMPUTED_VALUE', message: 'Calculated values are recalculated from their inputs, not corrected' });
    }
    if (point.recordedById !== ctx.userId) {
      const profile = await this.accessContext.resolveForCurrentPrincipal();
      if (!profile.isAdmin && !profile.capabilities.includes(PermissionKey.KPI_EDIT)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only the person who recorded this value, or a KPI editor, can correct it' });
      }
    }
    const previousValue = point.value;
    const previousNote = point.note;
    const newValue = dto.value ?? previousValue;
    const newNote = dto.note === undefined ? previousNote : dto.note;
    if (newValue === previousValue && newNote === previousNote) {
      throw new BadRequestException({ code: 'NO_CHANGE', message: 'The correction changes nothing' });
    }
    // A note-only fix of an older negative value stays possible.
    if (dto.value !== undefined) await this.assertValueAllowed(kpiId, newValue);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.kPIDataPoint.update({
        where: { recordedAt_id: { recordedAt: point.recordedAt, id: point.id } },
        data: { value: newValue, note: newNote },
        select: dataPointSelect,
      });
      await tx.kPIDataPointHistory.create({
        data: {
          organizationId: ctx.organizationId,
          dataPointId: point.id,
          kpiId,
          previousValue,
          newValue,
          previousNote,
          newNote,
          reason: dto.reason,
          changedById: ctx.userId,
        },
      });
      return row;
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'KPIDataPoint',
      entityId: point.id,
      metadata: { kpiId, previousValue, newValue, reason: dto.reason },
    });
    try {
      await this.realtime.publish(ctx.organizationId, {
        type: 'data_point_updated',
        kpiId,
        dataPointId: point.id,
        value: newValue,
        previousValue,
        recordedAt: updated.recordedAt.toISOString(),
        orgUnitId: updated.orgUnitId,
        userId: updated.userId,
      });
    } catch (err) {
      this.logger.warn(`KpiDataService: realtime publish failed for corrected dataPoint ${point.id}: ${String(err)}`);
    }
    if (newValue !== previousValue) {
      await this.alertEngine.enqueueEvaluateKpi({
        organizationId: ctx.organizationId,
        kpiId,
        dataPointId: point.id,
        value: newValue,
        recordedAt: updated.recordedAt.toISOString(),
        targetUserId: updated.userId,
      });
      await this.enqueueDerivedRecomputes(kpiId, updated.periodStart, updated.periodEnd, ctx.organizationId);
      await this.watches?.enqueue({
        organizationId: ctx.organizationId,
        kpiId,
        event: 'data_point_added',
        actorUserId: ctx.userId,
        pointUserId: updated.userId,
        pointOrgUnitId: updated.orgUnitId,
      });
    }
    return updated;
  }

  /** GET /kpis/:id/data/:pointId/history — corrections of a point the caller can read, newest first. */
  async dataPointHistory(kpiId: string, pointId: string): Promise<KPIDataPointHistory[]> {
    const ctx = RequestContextStore.require();
    await this.requireReadablePoint(kpiId, pointId);
    return this.prisma.kPIDataPointHistory.findMany({
      where: { organizationId: ctx.organizationId, dataPointId: pointId },
      orderBy: { changedAt: 'desc' },
      take: 100,
    });
  }

  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------

  /** A point the caller may read (GET /kpis/:id/data's rule), else 404 — no existence leak. */
  private async requireReadablePoint(kpiId: string, pointId: string) {
    const ctx = RequestContextStore.require();
    const kpi = await this.requireKpiInTenant(kpiId);
    if (!(await this.accessContext.isKpiVisible(kpiId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Data point not found' });
    }
    const point = await this.prisma.kPIDataPoint.findFirst({
      where: { id: pointId, organizationId: ctx.organizationId, kpiId, ...(await this.accessContext.kpiPointScopeWhere(kpi.scope)) },
      select: dataPointSelect,
    });
    if (!point) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Data point not found' });
    return point;
  }

  /** Refuses a negative value on a KPI with allowNegative off (the default). */
  private async assertValueAllowed(kpiId: string, value: number): Promise<void> {
    if (value >= 0) return;
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId },
      select: { allowNegative: true },
    });
    if (kpi && !kpi.allowNegative) {
      throw new UnprocessableEntityException({
        code: 'NEGATIVE_NOT_ALLOWED',
        message: 'This KPI does not allow negative values',
        details: { value },
      });
    }
  }

  private async requireKpiInTenant(kpiId: string) {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, name: true, scope: true, allowNegative: true, categoryId: true },
    });
    if (!kpi) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    return kpi;
  }

  /**
   * Flags the incoming value as an outlier vs the KPI's recent history (same
   * scope series), using the Welford 3σ detector. Never throws — a stats hiccup
   * must not block the write.
   */
  private async computeOutlierFlag(params: {
    organizationId: string;
    kpiId: string;
    orgUnitId: string | null;
    userId: string | null;
    dto: RecordDataPointDto;
  }): Promise<boolean> {
    if (params.dto?.value === undefined) return false;
    try {
      const prior = await this.prisma.kPIDataPoint.findMany({
        where: {
          organizationId: params.organizationId,
          kpiId: params.kpiId,
          orgUnitId: params.orgUnitId,
          userId: params.userId,
        },
        select: { value: true },
        // The 30 newest periods, not the 30 newest entries (see dashboardSummary).
        orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
        take: 30,
      });
      return detectOutlier(prior.map((p) => p.value), params.dto.value).isOutlier;
    } catch (err) {
      this.logger.warn(`outlier detection failed for kpi ${params.kpiId}: ${String(err)}`);
      return false;
    }
  }

  private async insertDataPoint(params: {
    organizationId: string;
    kpiId: string;
    orgUnitId: string | null;
    userId: string | null;
    recordedById: string | null;
    dto: RecordDataPointDto;
  }): Promise<PublicDataPoint> {
    if (!params.dto || params.dto.value === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'value is required',
      });
    }
    await this.assertValueAllowed(params.kpiId, params.dto.value);
    const isOutlier = await this.computeOutlierFlag(params);
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
        isOutlier,
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
    // Tell the KPI's watchers (each checked against their own point scope).
    await this.watches?.enqueue({
      organizationId: params.organizationId,
      kpiId: point.kpiId,
      event: 'data_point_added',
      actorUserId: params.recordedById,
      pointUserId: point.userId,
      pointOrgUnitId: point.orgUnitId,
    });

    // Reactive recompute pipeline (fire-and-forget). COMPUTED points are written
    // by the calc engine via direct Prisma writes (never through this path), so
    // the guard below prevents re-entry / infinite loops.
    if (point.sourceType !== 'COMPUTED') {
      await this.enqueueDerivedRecomputes(point.kpiId, point.periodStart, point.periodEnd, params.organizationId);

      // Generic workflow engine: fire kpi_changed (fire-and-forget; runEvent
      // swallows its own errors so a rule never breaks the data write).
      if (this.workflows) {
        await this.workflows.runEvent('kpi_changed', {
          kind: 'kpi_changed',
          kpiId: point.kpiId,
          value: point.value,
        });
      }
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

  private async buildVisibilityContext(): Promise<KpiVisibilityContext> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    return kpiContextFromProfile(ctx.organizationId, ctx.userId, profile);
  }
}
