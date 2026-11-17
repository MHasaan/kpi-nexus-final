import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccessContextService } from '../../rbac/services/access-context.service.js';
import { RequestContextStore } from '../../tenancy/request-context.js';
import type { UpdateUserDto } from '../dto/update-user.dto.js';
import { type PublicUser, userSelect } from '../users.service.js';

/** How far up a reporting chain we walk before giving up (a real chain is far shorter). */
const MAX_CHAIN_DEPTH = 200;

const TERMINAL = new Set(['DELETED', 'PURGED']);
const CANNOT_MANAGE = new Set(['ARCHIVED', 'DELETED', 'PURGED']);

/**
 * Change another person's role, manager, position or name.
 *
 * Until this existed nothing could set a manager at all (so /team was empty in
 * every real organisation) and a person's role or position was fixed at the
 * moment they were invited (UI-010).
 *
 * The rules that keep it safe:
 *  - nobody changes their own role;
 *  - only an administrator hands out, or takes away, an administrator role;
 *  - the last active administrator cannot be demoted;
 *  - a reporting line never loops back on itself.
 *
 * A role change reaches the person's session within the access-token lifetime:
 * a refresh re-reads the role from the database.
 */
@Injectable()
export class UserUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessContext: AccessContextService,
  ) {}

  async update(userId: string, dto: UpdateUserDto): Promise<PublicUser> {
    const ctx = RequestContextStore.require();
    const target = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, status: true, roleId: true, managerId: true, positionId: true, fullName: true },
    });
    // Out-of-scope people are a 404, as if absent (BE-004).
    if (!target || !(await this.accessContext.isPersonVisible(userId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    if (TERMINAL.has(target.status)) {
      throw new BadRequestException({
        code: 'NOT_EDITABLE',
        message: `User is ${target.status} and cannot be edited`,
        details: { status: target.status },
      });
    }

    const data: { fullName?: string; roleId?: string; managerId?: string | null; positionId?: string | null } = {};

    if (dto.fullName !== undefined && dto.fullName !== target.fullName) data.fullName = dto.fullName;

    if (dto.roleId !== undefined && dto.roleId !== target.roleId) {
      await this.assertRoleChangeAllowed(userId, target.roleId, dto.roleId);
      data.roleId = dto.roleId;
    }

    if (dto.managerId !== undefined && dto.managerId !== target.managerId) {
      if (dto.managerId !== null) await this.assertManagerAllowed(userId, dto.managerId);
      data.managerId = dto.managerId;
    }

    if (dto.positionId !== undefined && dto.positionId !== target.positionId) {
      if (dto.positionId !== null) {
        const position = await this.prisma.position.findFirst({
          where: { id: dto.positionId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!position) {
          throw new BadRequestException({
            code: 'VALIDATION_ERROR',
            message: 'positionId is invalid or belongs to another tenant',
          });
        }
      }
      data.positionId = dto.positionId;
    }

    const updated = await this.prisma.user.update({ where: { id: userId }, data, select: userSelect });

    const changed = Object.keys(data);
    if (changed.length > 0) {
      await this.audit.record({
        action: 'UPDATE',
        entityType: 'User',
        entityId: userId,
        metadata: {
          changed,
          ...(data.roleId !== undefined ? { fromRoleId: target.roleId, toRoleId: data.roleId } : {}),
          ...(data.managerId !== undefined ? { fromManagerId: target.managerId, toManagerId: data.managerId } : {}),
          ...(data.positionId !== undefined ? { fromPositionId: target.positionId, toPositionId: data.positionId } : {}),
        },
      });
    }
    return updated;
  }

  private async assertRoleChangeAllowed(userId: string, currentRoleId: string | null, nextRoleId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    if (userId === ctx.userId) {
      throw new BadRequestException({ code: 'SELF_ROLE_CHANGE', message: 'You cannot change your own role' });
    }
    const next = await this.prisma.roleDefinition.findFirst({
      where: { id: nextRoleId, organizationId: ctx.organizationId },
      select: { id: true, isAdmin: true },
    });
    if (!next) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'roleId is invalid or belongs to another tenant',
      });
    }
    const current = currentRoleId
      ? await this.prisma.roleDefinition.findFirst({
          where: { id: currentRoleId, organizationId: ctx.organizationId },
          select: { id: true, isAdmin: true },
        })
      : null;
    const wasAdmin = current?.isAdmin === true;

    // Granting or removing the administrator role is an administrator's call:
    // otherwise anyone who can manage users could make an administrator.
    if (next.isAdmin !== wasAdmin) {
      const caller = await this.accessContext.resolveForCurrentPrincipal();
      if (!caller.isAdmin) {
        throw new ForbiddenException({
          code: 'ADMIN_ROLE_REQUIRES_ADMIN',
          message: 'Only an administrator can give or remove an administrator role',
        });
      }
    }

    if (wasAdmin && !next.isAdmin) {
      const otherAdmins = await this.prisma.user.count({
        where: { organizationId: ctx.organizationId, status: 'ACTIVE', id: { not: userId }, role: { isAdmin: true } },
      });
      if (otherAdmins === 0) {
        throw new BadRequestException({
          code: 'LAST_ADMIN',
          message: 'This is the last active administrator. Make someone else an administrator first.',
        });
      }
    }
  }

  private async assertManagerAllowed(userId: string, managerId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    if (managerId === userId) {
      throw new BadRequestException({ code: 'SELF_MANAGER', message: 'A person cannot be their own manager' });
    }
    const manager = await this.prisma.user.findFirst({
      where: { id: managerId, organizationId: ctx.organizationId },
      select: { id: true, status: true, managerId: true },
    });
    if (!manager || CANNOT_MANAGE.has(manager.status)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'managerId is invalid, inactive or belongs to another tenant',
      });
    }
    // Walk up from the proposed manager: reaching the person themselves means
    // the new line would loop (A reports to B reports to A).
    let cursor: string | null = manager.managerId;
    for (let depth = 0; cursor && depth < MAX_CHAIN_DEPTH; depth += 1) {
      if (cursor === userId) {
        throw new BadRequestException({
          code: 'MANAGER_CYCLE',
          message: 'That would make a reporting loop: this manager already reports, directly or indirectly, to this person',
        });
      }
      const above: { managerId: string | null } | null = await this.prisma.user.findFirst({
        where: { id: cursor, organizationId: ctx.organizationId },
        select: { managerId: true },
      });
      cursor = above?.managerId ?? null;
    }
  }
}
