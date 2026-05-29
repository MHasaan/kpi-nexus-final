import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { resolveStatus, type ResolvedStatus, type ThresholdBand } from './threshold-resolver.js';
import type {
  CreateThresholdBandDto,
  UpdateThresholdBandDto,
} from './dto/threshold-band.dto.js';

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
    await this.requireBand(id);
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

  /** Current status band for a KPI, applying per-band hysteresis. */
  async resolveStatus(kpiId: string): Promise<ResolvedStatus> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    const bands = await this.prisma.kPIThresholdBand.findMany({
      where: { kpiId, organizationId: ctx.organizationId },
      select: bandSelect,
      orderBy: { order: 'asc' },
    });
    if (bands.length === 0) return { band: null, reason: 'no_bands' };

    const window = Math.max(1, ...bands.map((b) => b.consecutivePointsRequired));
    const points = await this.prisma.kPIDataPoint.findMany({
      where: { kpiId, organizationId: ctx.organizationId },
      select: { value: true },
      orderBy: { recordedAt: 'desc' },
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
    return resolveStatus(bandsForResolver, points.map((p) => p.value));
  }

  private async requireKpi(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
  }

  private async requireBand(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const b = await this.prisma.kPIThresholdBand.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Threshold band not found' });
  }
}
