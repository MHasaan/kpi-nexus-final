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
import type {
  MoveUsersDto,
  SplitUnitDto,
} from './dto/reorganize.dto.js';

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

const nameHistorySelect = {
  id: true,
  orgUnitId: true,
  previousName: true,
  changedById: true,
  changedAt: true,
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
    const ctx = RequestContextStore.require();
    await this.getById(id);

    // BE-009: every reference must belong to this tenant (as create() checks),
    // and a new parent must not be the unit itself or one of its descendants.
    if (dto.parentUnitId !== undefined) {
      if (dto.parentUnitId === id) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'an org unit cannot be its own parent',
        });
      }
      await this.assertInTenant('orgUnit', dto.parentUnitId, ctx.organizationId, 'parentUnitId');
      await this.assertNotDescendant(id, dto.parentUnitId, ctx.organizationId);
    }
    if (dto.orgUnitTypeId !== undefined) {
      await this.assertInTenant('orgUnitType', dto.orgUnitTypeId, ctx.organizationId, 'orgUnitTypeId');
    }
    if (dto.headUserId !== undefined) {
      await this.assertInTenant('user', dto.headUserId, ctx.organizationId, 'headUserId');
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

  /** 400 unless `id` is a row of `model` in this tenant. */
  private async assertInTenant(
    model: 'orgUnit' | 'orgUnitType' | 'user',
    id: string,
    organizationId: string,
    field: string,
  ): Promise<void> {
    const args = { where: { id, organizationId }, select: { id: true } } as const;
    const row =
      model === 'orgUnit'
        ? await this.prisma.orgUnit.findFirst(args)
        : model === 'orgUnitType'
          ? await this.prisma.orgUnitType.findFirst(args)
          : await this.prisma.user.findFirst(args);
    if (!row) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${field} is invalid or belongs to another tenant`,
      });
    }
  }

  /**
   * 400 if `newParentId` is `unitId` or one of its descendants (walks up from
   * the proposed parent). The visited set + depth cap keep a pre-existing bad
   * cycle in the data from looping forever.
   */
  private async assertNotDescendant(
    unitId: string,
    newParentId: string,
    organizationId: string,
    message = 'parentUnitId would create a cycle (it is a descendant of this unit)',
  ): Promise<void> {
    const seen = new Set<string>();
    let cur: string | null = newParentId;
    while (cur && !seen.has(cur) && seen.size < 10_000) {
      if (cur === unitId) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message,
        });
      }
      seen.add(cur);
      const row: { parentUnitId: string | null } | null = await this.prisma.orgUnit.findFirst({
        where: { id: cur, organizationId },
        select: { parentUnitId: true },
      });
      cur = row?.parentUnitId ?? null;
    }
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

  // ==========================================================================
  // Reorganization — rename / move / merge / split
  // ==========================================================================

  /** Load a unit (tenant-scoped) or throw NotFound. */
  private async requireUnit(id: string) {
    const ctx = RequestContextStore.require();
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, name: true, parentUnitId: true, orgUnitTypeId: true },
    });
    if (!unit) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'org unit not found' });
    }
    return unit;
  }

  /**
   * Rename a unit, recording the previous name in OrgUnitNameHistory. The
   * history insert + name update happen in one transaction so the audit trail
   * can never drift from the live name.
   */
  async renameUnit(id: string, newName: string) {
    const ctx = RequestContextStore.require();
    const unit = await this.requireUnit(id);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.orgUnitNameHistory.create({
        data: {
          orgUnitId: id,
          previousName: unit.name,
          changedById: ctx.userId,
        },
      });
      return tx.orgUnit.update({
        where: { id },
        data: { name: newName },
        select: orgUnitSelect,
      });
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'OrgUnit',
      entityId: id,
      changes: { name: { from: unit.name, to: newName } },
    });

    return updated;
  }

  /** Name-change history for a unit, newest first. */
  async getNameHistory(id: string) {
    await this.requireUnit(id); // tenant ownership check
    return this.prisma.orgUnitNameHistory.findMany({
      where: { orgUnitId: id },
      select: nameHistorySelect,
      orderBy: { changedAt: 'desc' },
    });
  }

  /**
   * Move users into `toUnitId`, optionally ending their active membership in
   * `fromUnitId`. Membership in the target is idempotent against the unique
   * [orgUnitId, userId] constraint: a previously-left row is reactivated rather
   * than duplicated.
   */
  async moveUsers(dto: MoveUsersDto): Promise<void> {
    const ctx = RequestContextStore.require();
    const toUnit = await this.requireUnit(dto.toUnitId);
    if (dto.fromUnitId) {
      await this.requireUnit(dto.fromUnitId); // tenant ownership check
    }

    // Validate that every requested userId belongs to this tenant.
    const distinctIds = [...new Set(dto.userIds)];
    const foundUsers = await this.prisma.user.findMany({
      where: { id: { in: distinctIds }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (foundUsers.length !== distinctIds.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'one or more userIds are invalid or belong to another tenant',
      });
    }

    for (const userId of dto.userIds) {
      await this.prisma.$transaction(async (tx) => {
        if (dto.fromUnitId) {
          const fromMember = await tx.orgUnitMember.findFirst({
            where: {
              orgUnitId: dto.fromUnitId,
              userId,
              organizationId: ctx.organizationId,
              leftAt: null,
            },
            select: { id: true },
          });
          if (fromMember) {
            await tx.orgUnitMember.update({
              where: { id: fromMember.id },
              data: { leftAt: new Date(), leaveReason: 'TRANSFERRED' },
            });
          }
        }
        await this.upsertActiveMembership(tx, dto.toUnitId, userId, ctx.organizationId);
      });
    }

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'OrgUnit',
      entityId: dto.toUnitId,
      metadata: {
        action: 'move-users',
        userIds: dto.userIds,
        fromUnitId: dto.fromUnitId ?? null,
        toUnitId: toUnit.id,
      },
    });
  }

  /**
   * Merge `sourceId` into `targetId`: reparent the source's child units to the
   * target, move the source's active members to the target, then archive the
   * source (status → ARCHIVED). The source is never hard-deleted so historical
   * references and the audit trail stay intact.
   */
  async mergeUnits(sourceId: string, targetId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const source = await this.requireUnit(sourceId);
    const target = await this.requireUnit(targetId);

    if (sourceId === targetId) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'cannot merge an org unit into itself',
      });
    }
    // The source's children are re-parented to the target — if the target sits
    // inside the source's subtree that creates a cycle (BE-009).
    await this.assertNotDescendant(sourceId, targetId, ctx.organizationId, 'targetId is a descendant of the source unit; merging would create a cycle');

    const activeMembers = await this.prisma.orgUnitMember.findMany({
      where: { orgUnitId: sourceId, organizationId: ctx.organizationId, leftAt: null },
      select: { id: true, userId: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1. Reparent source's children to the target.
      await tx.orgUnit.updateMany({
        where: { parentUnitId: sourceId, organizationId: ctx.organizationId },
        data: { parentUnitId: targetId },
      });

      // 2. Move active members to the target.
      for (const member of activeMembers) {
        await tx.orgUnitMember.update({
          where: { id: member.id },
          data: { leftAt: new Date(), leaveReason: 'STRUCTURE_CHANGE' },
        });
        await this.upsertActiveMembership(tx, targetId, member.userId, ctx.organizationId);
      }

      // 3. Archive the source (never hard-delete).
      await tx.orgUnit.update({
        where: { id: sourceId },
        data: { status: 'ARCHIVED', isActive: false },
      });
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'OrgUnit',
      entityId: sourceId,
      metadata: {
        action: 'merge-into',
        sourceId: source.id,
        targetId: target.id,
        movedMemberCount: activeMembers.length,
      },
    });
  }

  /**
   * Split a unit: create a new sibling unit (same parent + type as the source)
   * named `newUnitName`, then move the listed members from the source into it.
   */
  async splitUnit(sourceId: string, dto: SplitUnitDto) {
    const ctx = RequestContextStore.require();
    const source = await this.requireUnit(sourceId);

    // Validate that every requested memberUserId belongs to this tenant.
    if (dto.memberUserIds.length > 0) {
      const distinctIds = [...new Set(dto.memberUserIds)];
      const foundUsers = await this.prisma.user.findMany({
        where: { id: { in: distinctIds }, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (foundUsers.length !== distinctIds.length) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'one or more userIds are invalid or belong to another tenant',
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const createData: Prisma.OrgUnitUncheckedCreateInput = {
        organizationId: ctx.organizationId,
        orgUnitTypeId: source.orgUnitTypeId,
        name: dto.newUnitName,
      };
      if (source.parentUnitId) {
        createData.parentUnitId = source.parentUnitId;
      }
      const newUnit = await tx.orgUnit.create({
        data: createData,
        select: orgUnitSelect,
      });

      for (const userId of dto.memberUserIds) {
        const member = await tx.orgUnitMember.findFirst({
          where: {
            orgUnitId: sourceId,
            userId,
            organizationId: ctx.organizationId,
            leftAt: null,
          },
          select: { id: true },
        });
        if (member) {
          await tx.orgUnitMember.update({
            where: { id: member.id },
            data: { leftAt: new Date(), leaveReason: 'TRANSFERRED' },
          });
        }
        await this.upsertActiveMembership(tx, newUnit.id, userId, ctx.organizationId);
      }

      return newUnit;
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'OrgUnit',
      entityId: created.id,
      metadata: {
        action: 'split',
        sourceId,
        memberUserIds: dto.memberUserIds,
      },
    });

    return created;
  }

  /**
   * BFS over `parentUnitId` to collect every descendant unit id of `unitId`
   * within the current tenant. Cycle-safe (tracks visited ids); the seed unit
   * itself is not included in the result.
   */
  async descendantsVisibleToHead(unitId: string): Promise<string[]> {
    const ctx = RequestContextStore.require();
    const visited = new Set<string>([unitId]);
    const result: string[] = [];
    const queue: string[] = [unitId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = await this.prisma.orgUnit.findMany({
        where: { parentUnitId: current, organizationId: ctx.organizationId },
        select: { id: true },
      });
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        result.push(child.id);
        queue.push(child.id);
      }
    }

    return result;
  }

  /** Active OrgUnitMember rows for a user within the current tenant. */
  listMembershipsByUser(userId: string) {
    const ctx = RequestContextStore.require();
    return this.prisma.orgUnitMember.findMany({
      where: { userId, organizationId: ctx.organizationId, leftAt: null },
      select: memberSelect,
      orderBy: { joinedAt: 'asc' },
    });
  }

  /**
   * Ensure an active membership for `userId` in `orgUnitId`. Reactivates a
   * previously-left row (honouring the unique [orgUnitId, userId] constraint)
   * or creates a fresh one. Runs inside the caller's transaction.
   */
  private async upsertActiveMembership(
    tx: Prisma.TransactionClient,
    orgUnitId: string,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const existing = await tx.orgUnitMember.findUnique({
      where: { orgUnitId_userId: { orgUnitId, userId } },
      select: { id: true, leftAt: true },
    });
    if (existing) {
      if (existing.leftAt !== null) {
        await tx.orgUnitMember.update({
          where: { id: existing.id },
          data: { leftAt: null, leaveReason: null, joinedAt: new Date() },
        });
      }
      return;
    }
    await tx.orgUnitMember.create({
      data: { organizationId, orgUnitId, userId },
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
