import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreatePermissionDelegationDto } from './dto/create-permission-delegation.dto.js';

const selectFields = {
  id: true,
  grantorUserId: true,
  granteeUserId: true,
  permissions: true,
  reason: true,
  validFrom: true,
  validTo: true,
  revokedAt: true,
  createdAt: true,
} as const;

@Injectable()
export class PermissionDelegationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lists delegations involving the current user OR all delegations if admin. */
  list(filters: { involvingUserId?: string; activeOnly?: boolean } = {}) {
    const ctx = RequestContextStore.require();
    const where: Record<string, unknown> = {
      organizationId: ctx.organizationId,
    };
    if (filters.involvingUserId) {
      where.OR = [
        { grantorUserId: filters.involvingUserId },
        { granteeUserId: filters.involvingUserId },
      ];
    }
    if (filters.activeOnly) {
      const now = new Date();
      where.revokedAt = null;
      where.validFrom = { lte: now };
      where.validTo = { gte: now };
    }
    return this.prisma.permissionDelegation.findMany({
      where,
      select: selectFields,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreatePermissionDelegationDto) {
    const ctx = RequestContextStore.require();

    // Both users must belong to the tenant
    const [grantor, grantee] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: dto.grantorUserId, organizationId: ctx.organizationId },
        select: { id: true },
      }),
      this.prisma.user.findFirst({
        where: { id: dto.granteeUserId, organizationId: ctx.organizationId },
        select: { id: true },
      }),
    ]);
    if (!grantor) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'grantorUserId is invalid or belongs to another tenant',
      });
    }
    if (!grantee) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'granteeUserId is invalid or belongs to another tenant',
      });
    }

    const created = await this.prisma.permissionDelegation.create({
      data: {
        organizationId: ctx.organizationId,
        grantorUserId: dto.grantorUserId,
        granteeUserId: dto.granteeUserId,
        permissions: dto.permissions,
        reason: dto.reason,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
      },
      select: selectFields,
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'PermissionDelegation',
      entityId: created.id,
      metadata: {
        grantorUserId: dto.grantorUserId,
        granteeUserId: dto.granteeUserId,
        validFrom: dto.validFrom.toISOString(),
        validTo: dto.validTo.toISOString(),
      },
    });

    return created;
  }

  async revoke(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const record = await this.prisma.permissionDelegation.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, revokedAt: true },
    });
    if (!record) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'permission delegation not found',
      });
    }
    if (record.revokedAt !== null) {
      // Idempotent revoke — already revoked is fine
      return;
    }
    await this.prisma.permissionDelegation.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'PermissionDelegation',
      entityId: id,
      metadata: { reason: 'revoked' },
    });
  }
}
