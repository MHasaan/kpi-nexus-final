import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type {
  AddMemberDto,
  CreateOrgUnitDto,
  UpdateOrgUnitDto,
} from './dto/create-org-unit.dto.js';

const orgUnitSelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  orgUnitTypeId: true,
  parentUnitId: true,
  headUserId: true,
  status: true,
  visibilityInherits: true,
  effectiveFrom: true,
  effectiveTo: true,
  metadata: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const memberSelect = {
  id: true,
  orgUnitId: true,
  userId: true,
  memberRole: true,
  joinedAt: true,
  leftAt: true,
  leaveReason: true,
} as const;

@Injectable()
export class OrgUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    const ctx = RequestContextStore.require();
    return this.prisma.orgUnit.findMany({
      where: { organizationId: ctx.organizationId },
      select: orgUnitSelect,
      orderBy: [{ name: 'asc' }],
    });
  }

  async getById(id: string) {
    const ctx = RequestContextStore.require();
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: orgUnitSelect,
    });
    if (!unit) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'org unit not found' });
    }
    return unit;
  }

  async create(dto: CreateOrgUnitDto) {
    const ctx = RequestContextStore.require();

    const orgUnitTypeId = dto.orgUnitTypeId ?? (await this.resolveDefaultTypeId());

    // Verify type belongs to tenant
    const type = await this.prisma.orgUnitType.findFirst({
      where: { id: orgUnitTypeId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!type) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'orgUnitTypeId is invalid or belongs to another tenant',
      });
    }

    // Verify parent belongs to tenant (if specified)
    if (dto.parentUnitId) {
      const parent = await this.prisma.orgUnit.findFirst({
        where: { id: dto.parentUnitId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'parentUnitId is invalid or belongs to another tenant',
        });
      }
    }

    // Verify headUser belongs to tenant (if specified)
    if (dto.headUserId) {
      const head = await this.prisma.user.findFirst({
        where: { id: dto.headUserId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!head) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'headUserId is invalid or belongs to another tenant',
        });
      }
    }

    const { metadata, ...rest } = dto;
    const data: Prisma.OrgUnitUncheckedCreateInput = {
      ...rest,
      orgUnitTypeId,
      organizationId: ctx.organizationId,
    };
    if (metadata !== undefined) {
      data.metadata = metadata as Prisma.InputJsonValue;
    }

    const created = await this.prisma.orgUnit.create({
      data,
      select: orgUnitSelect,
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'OrgUnit',
      entityId: created.id,
      changes: { name: created.name },
    });

    return created;
  }

  async update(id: string, dto: UpdateOrgUnitDto) {
    await this.getById(id);

    if (dto.parentUnitId === id) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'an org unit cannot be its own parent',
      });
    }

    const { metadata, ...rest } = dto;
    const data: Prisma.OrgUnitUpdateInput = { ...rest } as Prisma.OrgUnitUpdateInput;
    if (metadata !== undefined) {
      data.metadata = metadata as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.orgUnit.update({
      where: { id },
      data,
      select: orgUnitSelect,
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'OrgUnit',
      entityId: id,
      changes: dto as Record<string, unknown>,
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            children: true,
            members: { where: { leftAt: null } },
          },
        },
      },
    });
    if (!unit) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'org unit not found' });
    }
    if (unit._count.children > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `Org unit has ${unit._count.children} child unit(s); move or delete those first`,
        details: { childCount: unit._count.children },
      });
    }
    if (unit._count.members > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `Org unit has ${unit._count.members} active member(s); transfer them first`,
        details: { memberCount: unit._count.members },
      });
    }
    await this.prisma.orgUnit.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'OrgUnit',
      entityId: id,
      metadata: { name: unit.name },
    });
  }

  listMembers(orgUnitId: string) {
    const ctx = RequestContextStore.require();
    return this.prisma.orgUnitMember.findMany({
      where: { orgUnitId, organizationId: ctx.organizationId, leftAt: null },
      select: memberSelect,
      orderBy: { joinedAt: 'asc' },
    });
  }

  async addMember(orgUnitId: string, dto: AddMemberDto) {
    const ctx = RequestContextStore.require();
    await this.getById(orgUnitId); // verify orgUnit ownership

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'userId is invalid or belongs to another tenant',
      });
    }

    // Re-activate a soft-left membership if one exists; otherwise create.
    const existing = await this.prisma.orgUnitMember.findUnique({
      where: { orgUnitId_userId: { orgUnitId, userId: dto.userId } },
      select: { id: true, leftAt: true },
    });
    if (existing) {
      if (existing.leftAt === null) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'user is already a member',
        });
      }
      return this.prisma.orgUnitMember.update({
        where: { id: existing.id },
        data: {
          memberRole: dto.memberRole,
          leftAt: null,
          leaveReason: null,
          joinedAt: new Date(),
        },
        select: memberSelect,
      });
    }

    const created = await this.prisma.orgUnitMember.create({
      data: {
        organizationId: ctx.organizationId,
        orgUnitId,
        userId: dto.userId,
        memberRole: dto.memberRole,
      },
      select: memberSelect,
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'OrgUnitMember',
      entityId: created.id,
      metadata: { orgUnitId, userId: dto.userId, memberRole: dto.memberRole },
    });

    return created;
  }

  async removeMember(orgUnitId: string, userId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const member = await this.prisma.orgUnitMember.findFirst({
      where: { orgUnitId, userId, organizationId: ctx.organizationId, leftAt: null },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'membership not found (already left or never joined)',
      });
    }
    await this.prisma.orgUnitMember.update({
      where: { id: member.id },
      data: { leftAt: new Date(), leaveReason: 'STRUCTURE_CHANGE' },
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'OrgUnitMember',
      entityId: member.id,
      metadata: { orgUnitId, userId },
    });
  }

  /**
   * Resolve the org's default OrgUnitType (the one auto-seeded by
   * register-org). Falls back to the first available type if no default
   * is flagged.
   */
  private async resolveDefaultTypeId(): Promise<string> {
    const ctx = RequestContextStore.require();
    const defaultDimension = await this.prisma.orgUnitDimension.findFirst({
      where: { organizationId: ctx.organizationId, isDefault: true },
      select: { id: true },
    });
    if (defaultDimension) {
      const type = await this.prisma.orgUnitType.findFirst({
        where: {
          organizationId: ctx.organizationId,
          dimensionId: defaultDimension.id,
        },
        select: { id: true },
        orderBy: { sortOrder: 'asc' },
      });
      if (type) return type.id;
    }
    const any = await this.prisma.orgUnitType.findFirst({
      where: { organizationId: ctx.organizationId },
      select: { id: true },
      orderBy: { sortOrder: 'asc' },
    });
    if (!any) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'No OrgUnitType exists; create one before creating org units',
      });
    }
    return any.id;
  }
}
