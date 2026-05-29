import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type {
  CreateKpiCategoryDto,
  UpdateKpiCategoryDto,
} from './dto/kpi-category.dto.js';

const categorySelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  color: true,
  icon: true,
  sortOrder: true,
  createdAt: true,
  _count: { select: { kpis: true } },
} satisfies Prisma.KPICategorySelect;

export type PublicKpiCategory = Prisma.KPICategoryGetPayload<{ select: typeof categorySelect }>;

@Injectable()
export class KpiCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PublicKpiCategory[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.kPICategory.findMany({
      where: { organizationId: ctx.organizationId },
      select: categorySelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getById(id: string): Promise<PublicKpiCategory> {
    const ctx = RequestContextStore.require();
    const cat = await this.prisma.kPICategory.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: categorySelect,
    });
    if (!cat) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Category not found' });
    return cat;
  }

  async create(dto: CreateKpiCategoryDto): Promise<PublicKpiCategory> {
    const ctx = RequestContextStore.require();
    try {
      const created = await this.prisma.kPICategory.create({
        data: {
          organizationId: ctx.organizationId,
          name: dto.name,
          description: dto.description,
          color: dto.color,
          icon: dto.icon,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: categorySelect,
      });
      await this.audit.record({
        action: 'CREATE',
        entityType: 'KPICategory',
        entityId: created.id,
        metadata: { name: created.name },
      });
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ code: 'CONFLICT', message: 'A category with this name already exists' });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateKpiCategoryDto): Promise<PublicKpiCategory> {
    await this.getById(id); // tenant + existence
    try {
      const updated = await this.prisma.kPICategory.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          color: dto.color,
          icon: dto.icon,
          sortOrder: dto.sortOrder,
        },
        select: categorySelect,
      });
      await this.audit.record({ action: 'UPDATE', entityType: 'KPICategory', entityId: id });
      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ code: 'CONFLICT', message: 'A category with this name already exists' });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const cat = await this.getById(id);
    if (cat._count.kpis > 0) {
      throw new ConflictException({
        code: 'CATEGORY_IN_USE',
        message: `Category is assigned to ${cat._count.kpis} KPI(s); reassign them first`,
      });
    }
    await this.prisma.kPICategory.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'KPICategory', entityId: id });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === 'P2002'
  );
}
