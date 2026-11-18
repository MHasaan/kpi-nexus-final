import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { isCategoryAllowed } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { resolveStatus, type ResolvedStatus, type ThresholdBand } from './threshold-resolver.js';
import {
  boundsOrdered,
  type CreateThresholdBandDto,
  type UpdateThresholdBandDto,
} from './dto/threshold-band.dto.js';
import { type KpiHealthMeta, type KpiHealthStatus, attainmentPct, kpiHealthStatus } from '../kpis/kpi-health.js';
import type { KpiScope } from '../rbac/visibility/kpi-visibility.js';

const bandSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  name: true,
  lower: true,
  upper: true,
  color: true,
  order: true,
  consecutivePointsRequired: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.KPIThresholdBandSelect;

export type PublicThresholdBand = Prisma.KPIThresholdBandGetPayload<{ select: typeof bandSelect }>;

@Injectable()
export class KpiThresholdBandsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessContext: AccessContextService,
  ) {}

  async list(kpiId: string): Promise<PublicThresholdBand[]> {
    await this.requireKpi(kpiId);
    return this.prisma.kPIThresholdBand.findMany({
      where: { kpiId, organizationId: RequestContextStore.require().organizationId },
      select: bandSelect,
      orderBy: { order: 'asc' },
    });
  }

  async create(kpiId: string, dto: CreateThresholdBandDto): Promise<PublicThresholdBand> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    const created = await this.prisma.kPIThresholdBand.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        name: dto.name,
        lower: dto.lower ?? null,
        upper: dto.upper ?? null,
        color: dto.color,
        order: dto.order,
        consecutivePointsRequired: dto.consecutivePointsRequired ?? 1,
        createdById: ctx.userId,
      },
      select: bandSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'KPIThresholdBand', entityId: created.id, metadata: { kpiId, name: created.name } });
    return created;
  }

  async update(id: string, dto: UpdateThresholdBandDto): Promise<PublicThresholdBand> {
    const current = await this.requireBand(id);
    // A one-bound patch can still invert the band against the stored other bound (BE-012).
    const merged = {
      lower: dto.lower !== undefined ? dto.lower : current.lower,
      upper: dto.upper !== undefined ? dto.upper : current.upper,
    };
    if (!boundsOrdered(merged)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'lower must be less than or equal to upper',
      });
    }
    const updated = await this.prisma.kPIThresholdBand.update({
      where: { id },
      data: {
        name: dto.name,
        lower: dto.lower,
        upper: dto.upper,
        color: dto.color,
        order: dto.order,
        consecutivePointsRequired: dto.consecutivePointsRequired,
      },
      select: bandSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'KPIThresholdBand', entityId: id });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.requireBand(id);
    await this.prisma.kPIThresholdBand.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'KPIThresholdBand', entityId: id });
  }

  /**
   * Current status of a KPI: the band it is in (with per-band hysteresis), and
   * its health by the one rule the home page, scorecard and board pack use
   * (`kpiHealthStatus`: bands, then the KPI's own warning / critical
   * thresholds, then its target). The KPI page used to show only the band, so
   * a KPI graded by its thresholds read "At risk" at home and "no bands" here.
   */
  async resolveStatus(kpiId: string): Promise<ResolvedStatus & { health: KpiHealthStatus; attainmentPct: number | null }> {
    const ctx = RequestContextStore.require();
    const { scope, ...meta } = await this.requireKpi(kpiId);
    const bands = await this.prisma.kPIThresholdBand.findMany({
      where: { kpiId, organizationId: ctx.organizationId },
      select: bandSelect,
      orderBy: { order: 'asc' },
    });
    const window = Math.max(1, ...bands.map((b) => b.consecutivePointsRequired));
    const points = await this.prisma.kPIDataPoint.findMany({
      // Only the values the caller may read (BE-050): on a per-person or per-unit KPI the newest
      // row may be someone else's, and a status worked out from it tells the caller about it.
      where: { kpiId, organizationId: ctx.organizationId, ...(await this.accessContext.kpiPointScopeWhere(scope)) },
      select: { value: true },
      // Newest period first ("latest" = newest period; entry time breaks ties).
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      take: window,
    });
    const bandsForResolver: ThresholdBand[] = bands.map((b) => ({
      name: b.name,
      lower: b.lower,
      upper: b.upper,
      color: b.color,
      order: b.order,
      consecutivePointsRequired: b.consecutivePointsRequired,
    }));
    const recentValues = points.map((p) => p.value);
    const health = kpiHealthStatus({ recentValues, meta, bands: bandsForResolver });
    // How far the newest value the caller may read has come towards the target — the figure the
    // home page shows, by the same rule.
    const attainment = attainmentPct(recentValues[0] ?? null, meta.targetValue, meta.direction);
    if (bands.length === 0) return { band: null, reason: 'no_bands', health, attainmentPct: attainment };
    return { ...resolveStatus(bandsForResolver, recentValues), health, attainmentPct: attainment };
  }

  private async requireKpi(kpiId: string): Promise<KpiHealthMeta & { scope: KpiScope }> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, categoryId: true, scope: true, direction: true, targetValue: true, warningThreshold: true, criticalThreshold: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    // Layer-3 category allowlist (Phase 3): hide a KPI outside the allowed categories
    // the same way listForKpi does — 404, no existence leak. null ⇒ all (admins/parity).
    if (!isCategoryAllowed(await this.accessContext.kpiCategoryAllowlist(), kpi.categoryId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    return {
      scope: kpi.scope as KpiScope,
      direction: kpi.direction,
      targetValue: kpi.targetValue ?? null,
      warningThreshold: kpi.warningThreshold ?? null,
      criticalThreshold: kpi.criticalThreshold ?? null,
    };
  }

  private async requireBand(id: string): Promise<{ lower: number | null; upper: number | null }> {
    const ctx = RequestContextStore.require();
    const b = await this.prisma.kPIThresholdBand.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, lower: true, upper: true },
    });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Threshold band not found' });
    return b;
  }
}
