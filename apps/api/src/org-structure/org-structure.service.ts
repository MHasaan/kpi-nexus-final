import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateDimensionDto, CreateTypeDto, UpdateDimensionDto, UpdateTypeDto } from './dto/org-structure.dto.js';

const dimensionSelect = {
  id: true,
  organizationId: true,
  name: true,
  isDefault: true,
  createdAt: true,
} satisfies Prisma.OrgUnitDimensionSelect;

const typeSelect = {
  id: true,
  organizationId: true,
  dimensionId: true,
  name: true,
  namePlural: true,
  icon: true,
  color: true,
  allowNesting: true,
  maxDepth: true,
  allowedParentTypeIds: true,
  sortOrder: true,
  createdAt: true,
} satisfies Prisma.OrgUnitTypeSelect;

export type PublicDimension = Prisma.OrgUnitDimensionGetPayload<{ select: typeof dimensionSelect }>;
export type PublicType = Prisma.OrgUnitTypeGetPayload<{ select: typeof typeSelect }>;

@Injectable()
export class OrgStructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- Dimensions --------------------------------------------------------
  listDimensions(): Promise<PublicDimension[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.orgUnitDimension.findMany({
      where: { organizationId: ctx.organizationId },
      select: dimensionSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createDimension(dto: CreateDimensionDto): Promise<PublicDimension> {
    const ctx = RequestContextStore.require();
    try {
      const created = await this.prisma.orgUnitDimension.create({
        data: { organizationId: ctx.organizationId, name: dto.name, isDefault: dto.isDefault ?? false },
        select: dimensionSelect,
      });
      await this.audit.record({ action: 'CREATE', entityType: 'OrgUnitDimension', entityId: created.id, metadata: { name: created.name } });
      return created;
    } catch (err) {
      throw this.rethrowUnique(err, 'A dimension with this name already exists');
    }
  }

  async updateDimension(id: string, dto: UpdateDimensionDto): Promise<PublicDimension> {
    await this.requireDimension(id);
    const updated = await this.prisma.orgUnitDimension.update({
      where: { id },
      data: { name: dto.name, isDefault: dto.isDefault },
      select: dimensionSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'OrgUnitDimension', entityId: id });
    return updated;
  }

  async deleteDimension(id: string): Promise<void> {
    await this.requireDimension(id);
    const typeCount = await this.prisma.orgUnitType.count({ where: { dimensionId: id } });
    if (typeCount > 0) {
      throw new BadRequestException({ code: 'DIMENSION_IN_USE', message: `Dimension has ${typeCount} type(s); reassign or delete them first` });
    }
    await this.prisma.orgUnitDimension.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'OrgUnitDimension', entityId: id });
  }

  // ---- Types -------------------------------------------------------------
  listTypes(dimensionId?: string): Promise<PublicType[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.orgUnitType.findMany({
      where: { organizationId: ctx.organizationId, ...(dimensionId ? { dimensionId } : {}) },
      select: typeSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createType(dto: CreateTypeDto): Promise<PublicType> {
    const ctx = RequestContextStore.require();
    if (dto.dimensionId) await this.requireDimension(dto.dimensionId);
    try {
      const created = await this.prisma.orgUnitType.create({
        data: {
          organizationId: ctx.organizationId,
          dimensionId: dto.dimensionId,
          name: dto.name,
          namePlural: dto.namePlural,
          icon: dto.icon,
          color: dto.color,
          allowNesting: dto.allowNesting ?? true,
          maxDepth: dto.maxDepth,
          allowedParentTypeIds: dto.allowedParentTypeIds ?? [],
          sortOrder: dto.sortOrder ?? 0,
        },
        select: typeSelect,
      });
      await this.audit.record({ action: 'CREATE', entityType: 'OrgUnitType', entityId: created.id, metadata: { name: created.name } });
      return created;
    } catch (err) {
      throw this.rethrowUnique(err, 'A type with this name already exists');
    }
  }

  async updateType(id: string, dto: UpdateTypeDto): Promise<PublicType> {
    await this.requireType(id);
    if (dto.dimensionId) await this.requireDimension(dto.dimensionId);
    const updated = await this.prisma.orgUnitType.update({
      where: { id },
      data: {
        dimensionId: dto.dimensionId,
        name: dto.name,
        namePlural: dto.namePlural,
        icon: dto.icon,
        color: dto.color,
        allowNesting: dto.allowNesting,
        maxDepth: dto.maxDepth,
        allowedParentTypeIds: dto.allowedParentTypeIds,
        sortOrder: dto.sortOrder,
      },
      select: typeSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'OrgUnitType', entityId: id });
    return updated;
  }

  async deleteType(id: string): Promise<void> {
    await this.requireType(id);
    const unitCount = await this.prisma.orgUnit.count({ where: { orgUnitTypeId: id } });
    if (unitCount > 0) {
      throw new BadRequestException({ code: 'TYPE_IN_USE', message: `Type is used by ${unitCount} org unit(s)` });
    }
    await this.prisma.orgUnitType.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'OrgUnitType', entityId: id });
  }

  private async requireDimension(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const d = await this.prisma.orgUnitDimension.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!d) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dimension not found' });
  }

  private async requireType(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const t = await this.prisma.orgUnitType.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Type not found' });
  }

  private rethrowUnique(err: unknown, message: string): Error {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002') {
      return new ConflictException({ code: 'CONFLICT', message });
    }
    return err as Error;
  }
}
