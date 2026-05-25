import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateResourcePermissionDto } from './dto/create-resource-permission.dto.js';

const selectFields = {
  id: true,
  subjectType: true,
  subjectId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  grantedById: true,
  expiresAt: true,
  createdAt: true,
} as const;

@Injectable()
export class ResourcePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(filters: {
    subjectType?: 'user' | 'role';
    subjectId?: string;
    resourceType?: string;
    resourceId?: string;
  } = {}) {
    const ctx = RequestContextStore.require();
    return this.prisma.resourcePermission.findMany({
      where: {
        organizationId: ctx.organizationId,
        subjectType: filters.subjectType,
        subjectId: filters.subjectId,
        resourceType: filters.resourceType,
        resourceId: filters.resourceId,
      },
      select: selectFields,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateResourcePermissionDto) {
    const ctx = RequestContextStore.require();

    // Verify the subject (user or role) belongs to the tenant
    if (dto.subjectType === 'user') {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.subjectId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'subjectId is invalid or belongs to another tenant',
        });
      }
    } else {
      const role = await this.prisma.roleDefinition.findFirst({
        where: { id: dto.subjectId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'subjectId is invalid or belongs to another tenant',
        });
      }
    }

    try {
      const created = await this.prisma.resourcePermission.create({
        data: {
          organizationId: ctx.organizationId,
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          action: dto.action,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
          grantedById: ctx.userId,
          expiresAt: dto.expiresAt,
        },
        select: selectFields,
      });

      await this.audit.record({
        action: 'CREATE',
        entityType: 'ResourcePermission',
        entityId: created.id,
        metadata: {
          subjectType: dto.subjectType,
          subjectId: dto.subjectId,
          action: dto.action,
          resourceType: dto.resourceType,
          resourceId: dto.resourceId,
        },
      });

      return created;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'This resource permission already exists',
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const record = await this.prisma.resourcePermission.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!record) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'resource permission not found' });
    }
    await this.prisma.resourcePermission.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'ResourcePermission',
      entityId: id,
    });
  }
}
