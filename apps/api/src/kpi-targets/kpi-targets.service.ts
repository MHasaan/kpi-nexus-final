import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  validateTarget,
  type CreateKpiTargetDto,
  type KpiDirection,
  type UpdateKpiTargetDto,
} from './kpi-target.validation.js';

const targetSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  type: true,
  value: true,
  minValue: true,
  expectedValue: true,
  stretchValue: true,
  impossibleValue: true,
  formula: true,
  metadata: true,
  effectiveFrom: true,
  effectiveTo: true,
  scenarioName: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
} satisfies Prisma.KPITargetSelect;

export type PublicKpiTarget = Prisma.KPITargetGetPayload<{ select: typeof targetSelect }>;

@Injectable()
export class KpiTargetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(kpiId: string): Promise<PublicKpiTarget[]> {
    await this.requireKpi(kpiId);
    return this.prisma.kPITarget.findMany({
      where: { kpiId, organizationId: RequestContextStore.require().organizationId },
      select: targetSelect,
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(kpiId: string, dto: CreateKpiTargetDto): Promise<PublicKpiTarget> {
    const ctx = RequestContextStore.require();
    const direction = await this.requireKpi(kpiId);
    this.assertValid(dto, direction);

    const created = await this.prisma.kPITarget.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        type: dto.type,
        value: dto.value,
        minValue: dto.minValue,
        expectedValue: dto.expectedValue,
        stretchValue: dto.stretchValue,
        impossibleValue: dto.impossibleValue,
        formula: dto.formula,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo,
        scenarioName: dto.scenarioName,
        createdById: ctx.userId,
      },
      select: targetSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'KPITarget', entityId: created.id, metadata: { kpiId, type: created.type } });
    return created;
  }

  async update(id: string, dto: UpdateKpiTargetDto): Promise<PublicKpiTarget> {
    const existing = await this.requireTarget(id);
    const direction = await this.requireKpi(existing.kpiId);
    // Validate the merged shape.
    this.assertValid({ ...existing, ...dto } as CreateKpiTargetDto, direction);

    const updated = await this.prisma.kPITarget.update({
      where: { id },
      data: {
        type: dto.type,
        value: dto.value,
        minValue: dto.minValue,
        expectedValue: dto.expectedValue,
        stretchValue: dto.stretchValue,
        impossibleValue: dto.impossibleValue,
        formula: dto.formula,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo,
        scenarioName: dto.scenarioName,
      },
      select: targetSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'KPITarget', entityId: id });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.requireTarget(id);
    await this.prisma.kPITarget.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'KPITarget', entityId: id });
  }

  /**
   * The target in effect at `at`: the most-recent target whose effective window
   * contains the moment (null bounds = open-ended), tie-broken by createdAt.
   */
  async resolveActive(kpiId: string, at: Date = new Date()): Promise<PublicKpiTarget | null> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    const candidates = await this.prisma.kPITarget.findMany({
      where: {
        kpiId,
        organizationId: ctx.organizationId,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] },
        ],
      },
      select: targetSelect,
      // Most-specific window wins: a dated effectiveFrom outranks an open-ended
      // (null) one, hence nulls last.
      orderBy: [{ effectiveFrom: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return candidates[0] ?? null;
  }

  private assertValid(dto: CreateKpiTargetDto, direction: KpiDirection): void {
    const errors = validateTarget(dto, direction);
    if (errors.length > 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: errors[0], details: { errors } });
    }
  }

  private async requireKpi(kpiId: string): Promise<KpiDirection> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { direction: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    return kpi.direction as KpiDirection;
  }

  private async requireTarget(id: string): Promise<PublicKpiTarget> {
    const ctx = RequestContextStore.require();
    const t = await this.prisma.kPITarget.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: targetSelect,
    });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Target not found' });
    return t;
  }
}
