import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';

export interface PublicRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isAdmin: boolean;
  level: number;
  color: string | null;
  canAccessModules: string[];
  createdAt: Date;
  updatedAt: Date;
}

const roleSelect = {
  id: true,
  name: true,
  description: true,
  permissions: true,
  isAdmin: true,
  level: true,
  color: true,
  canAccessModules: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PermissionResolverService,
  ) {}

  async list(): Promise<PublicRole[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.roleDefinition.findMany({
      where: { organizationId: ctx.organizationId },
      select: roleSelect,
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(id: string): Promise<PublicRole> {
    const ctx = RequestContextStore.require();
    const role = await this.prisma.roleDefinition.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: roleSelect,
    });
    if (!role) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'role not found' });
    }
    return role;
  }

  async create(dto: CreateRoleDto): Promise<PublicRole> {
    const ctx = RequestContextStore.require();
    try {
      const created = await this.prisma.roleDefinition.create({
        data: {
          organizationId: ctx.organizationId,
          name: dto.name,
          description: dto.description,
          permissions: dto.permissions,
          isAdmin: dto.isAdmin,
          level: dto.level,
          color: dto.color,
          canAccessModules: dto.canAccessModules,
        },
        select: roleSelect,
      });
      this.resolver.invalidateAll();
      return created;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A role with this name already exists',
        });
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateRoleDto): Promise<PublicRole> {
    // Verify the role belongs to the tenant before updating
    await this.getById(id);

    try {
      const updated = await this.prisma.roleDefinition.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          permissions: dto.permissions,
          isAdmin: dto.isAdmin,
          level: dto.level,
          color: dto.color,
          canAccessModules: dto.canAccessModules,
        },
        select: roleSelect,
      });
      this.resolver.invalidateAll();
      return updated;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A role with this name already exists',
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    // Verify ownership + count usage to avoid orphaning users
    const role = await this.prisma.roleDefinition.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, isAdmin: true, _count: { select: { users: true } } },
    });
    if (!role) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'role not found' });
    }
    if (role._count.users > 0) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: `Role still has ${role._count.users} user(s); reassign before deleting`,
        details: { userCount: role._count.users },
      });
    }
    if (role.isAdmin) {
      // Guardrail — leave at least one Admin role per tenant.
      const otherAdminCount = await this.prisma.roleDefinition.count({
        where: {
          organizationId: ctx.organizationId,
          isAdmin: true,
          id: { not: id },
        },
      });
      if (otherAdminCount === 0) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Cannot delete the last Admin role',
        });
      }
    }
    await this.prisma.roleDefinition.delete({ where: { id } });
    this.resolver.invalidateAll();
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
