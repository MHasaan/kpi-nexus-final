import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateKeyResultDto, UpdateKeyResultDto } from './dto/okr.dto.js';
import { ObjectivesService } from './objectives.service.js';
import { keyResultProgress } from './progress-math.js';

const krSelect = {
  id: true,
  organizationId: true,
  objectiveId: true,
  name: true,
  description: true,
  kpiId: true,
  baselineValue: true,
  targetValue: true,
  currentValue: true,
  weight: true,
  progress: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.KeyResultSelect;

export type PublicKeyResult = Prisma.KeyResultGetPayload<{ select: typeof krSelect }>;

@Injectable()
export class KeyResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly objectives: ObjectivesService,
  ) {}

  async list(objectiveId: string): Promise<PublicKeyResult[]> {
    const ctx = RequestContextStore.require();
    await this.objectives.getById(objectiveId); // tenant + existence
    return this.prisma.keyResult.findMany({
      where: { organizationId: ctx.organizationId, objectiveId },
      select: krSelect,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async create(objectiveId: string, dto: CreateKeyResultDto): Promise<PublicKeyResult> {
    const ctx = RequestContextStore.require();
    await this.objectives.getById(objectiveId); // tenant + existence
    const progress = keyResultProgress({
      baselineValue: dto.baselineValue ?? null,
      targetValue: dto.targetValue,
      currentValue: dto.currentValue ?? null,
    });
    const created = await this.prisma.keyResult.create({
      data: {
        organizationId: ctx.organizationId,
        objectiveId,
        name: dto.name,
        description: dto.description,
        kpiId: dto.kpiId,
        baselineValue: dto.baselineValue,
        targetValue: dto.targetValue,
        currentValue: dto.currentValue,
        weight: dto.weight,
        progress,
      },
      select: krSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'KeyResult', entityId: created.id, metadata: { objectiveId } });
    await this.objectives.recomputeObjectiveProgress(objectiveId);
    return created;
  }

  async update(id: string, dto: UpdateKeyResultDto): Promise<PublicKeyResult> {
    const existing = await this.loadInOrg(id);
    const next = {
      baselineValue: dto.baselineValue ?? existing.baselineValue,
      targetValue: dto.targetValue ?? existing.targetValue,
      currentValue: dto.currentValue ?? existing.currentValue,
    };
    const progress = keyResultProgress(next);
    const updated = await this.prisma.keyResult.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        kpiId: dto.kpiId,
        baselineValue: dto.baselineValue,
        targetValue: dto.targetValue,
        currentValue: dto.currentValue,
        weight: dto.weight,
        progress,
      },
      select: krSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'KeyResult', entityId: id });
    await this.objectives.recomputeObjectiveProgress(existing.objectiveId);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const existing = await this.loadInOrg(id);
    await this.prisma.keyResult.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'KeyResult', entityId: id });
    await this.objectives.recomputeObjectiveProgress(existing.objectiveId);
  }

  private async loadInOrg(id: string): Promise<PublicKeyResult> {
    const ctx = RequestContextStore.require();
    const kr = await this.prisma.keyResult.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: krSelect,
    });
    if (!kr) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Key result not found' });
    return kr;
  }
}
