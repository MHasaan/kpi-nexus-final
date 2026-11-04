import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import type { Prisma } from '@kpi-nexus/db';
import type {
  DataLimitsConfig,
  PermissionKey,
  DataTypeConfig,
  PageAccessConfig,
  ScopeConfig,
} from '@kpi-nexus/contracts';

import { ApprovalGateService } from '../approvals/approval-gate.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateRoleDto } from './dto/create-role.dto.js';
import type { UpdateRoleDto } from './dto/update-role.dto.js';
import { findPreset, PERMISSION_PRESETS, type PermissionPreset } from './permission-presets.js';

export interface PublicRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isAdmin: boolean;
  level: number;
  color: string | null;
  canAccessModules: string[];
  scopeConfig: ScopeConfig | null;
  dataTypeConfig: DataTypeConfig | null;
  dataLimits: DataLimitsConfig | null;
  pageAccess: PageAccessConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleHierarchy {
  roles: PublicRole[];
  edges: Array<{ parentRoleId: string; childRoleId: string }>;
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
  scopeConfig: true,
  dataTypeConfig: true,
  dataLimits: true,
  pageAccess: true,
  createdAt: true,
  updatedAt: true,
} as const;

type RoleRow = Prisma.RoleDefinitionGetPayload<{ select: typeof roleSelect }>;

/** Narrow Prisma's JsonValue config columns to their typed contract shapes for the API. */
function toPublicRole(row: RoleRow): PublicRole {
  return {
    ...row,
    scopeConfig: (row.scopeConfig as ScopeConfig | null) ?? null,
    dataTypeConfig: (row.dataTypeConfig as DataTypeConfig | null) ?? null,
    dataLimits: (row.dataLimits as DataLimitsConfig | null) ?? null,
    pageAccess: (row.pageAccess as PageAccessConfig | null) ?? null,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PermissionResolverService,
    private readonly accessContext: AccessContextService,
    @Optional() private readonly approvalGate?: ApprovalGateService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * Privilege-escalation guard: a non-admin ROLES_MANAGE holder may only ADD
   * permissions they hold themselves, and may not change isAdmin. Removing
   * permissions they lack is fine. Mirrors the per-user override guard in
   * UsersService.upsertAccessOverride. Runs before the approval gate so an
   * escalating change can't even be queued.
   */
  private async assertCanGrant(change: {
    added: readonly string[];
    isAdminChanged: boolean;
  }): Promise<void> {
    if (change.added.length === 0 && !change.isAdminChanged) return;
    const ctx = RequestContextStore.require();
    const caller = await this.resolver.resolveForUser(ctx.organizationId, ctx.userId, ctx.roleId);
    if (caller.isAdmin) return;
    if (change.isAdminChanged) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only administrators can change the admin flag' });
    }
    const missing = change.added.filter((p) => !caller.permissions.has(p as PermissionKey));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Cannot grant permissions you do not hold: ${missing.join(', ')}`,
      });
    }
  }

  /** Invalidate the per-request permission + access caches after a role change. */
  private invalidateCaches(): void {
    this.resolver.invalidateAll();
    this.accessContext.invalidateAll();
  }

  async list(): Promise<PublicRole[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.roleDefinition.findMany({
      where: { organizationId: ctx.organizationId },
      select: roleSelect,
      orderBy: [{ level: 'desc' }, { name: 'asc' }],
    });
    return rows.map(toPublicRole);
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
    return toPublicRole(role);
  }

  async create(dto: CreateRoleDto): Promise<PublicRole> {
    const ctx = RequestContextStore.require();
    await this.assertCanGrant({ added: dto.permissions, isAdminChanged: dto.isAdmin === true });
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
      this.invalidateCaches();
      return toPublicRole(created);
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

  async update(
    id: string,
    dto: UpdateRoleDto,
    opts: { bypassApproval?: boolean } = {},
  ): Promise<PublicRole> {
    const ctx = RequestContextStore.require();
    // Verify the role belongs to the tenant before updating
    const existing = await this.getById(id);

    // Tenant-validate the KPI category allowlist before persisting — every id
    // must resolve to a kPICategory in this org. Mirrors the categoryId check
    // in kpis.service.ts. Prevents storing foreign/unknown category ids.
    const categoryIds = dto.dataTypeConfig?.kpiCategoryIds;
    if (categoryIds && categoryIds.length > 0) {
      const found = await this.prisma.kPICategory.findMany({
        where: { id: { in: categoryIds }, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (found.length !== new Set(categoryIds).size) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'dataTypeConfig.kpiCategoryIds contains unknown categories',
        });
      }
    }

    // An approved request (bypassApproval) was checked when it was queued; the
    // approver applying it need not hold every permission it grants.
    if (!opts.bypassApproval) {
      await this.assertCanGrant({
        added: (dto.permissions ?? []).filter((p) => !existing.permissions.includes(p)),
        isAdminChanged: dto.isAdmin !== undefined && dto.isAdmin !== existing.isAdmin,
      });
    }

    // Approval seam: gate only sensitive permission changes (permissions /
    // isAdmin). Cosmetic edits (name, color) flow through untouched.
    if (this.approvalGate && !opts.bypassApproval && (dto.permissions !== undefined || dto.isAdmin !== undefined)) {
      await this.approvalGate.requireApprovalIfActive('ROLE_PERMISSIONS', id, dto, {
        ...opts,
        currentPayload: existing,
      });
    }

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
          scopeConfig: dto.scopeConfig ?? undefined,
          dataTypeConfig: dto.dataTypeConfig ?? undefined,
          dataLimits: dto.dataLimits ?? undefined,
          pageAccess: dto.pageAccess ?? undefined,
        },
        select: roleSelect,
      });
      this.invalidateCaches();
      return toPublicRole(updated);
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
    this.invalidateCaches();
  }

  // ---------------------------------------------------------------------------
  // Preset methods
  // ---------------------------------------------------------------------------

  /**
   * Returns the catalog of permission presets derived from DEFAULT_ROLES.
   * No DB access — purely in-memory.
   */
  listPresets(): PermissionPreset[] {
    return PERMISSION_PRESETS;
  }

  /**
   * Applies a named preset to the given role — sets `permissions` (and
   * `isAdmin` for the ADMIN preset) to the preset's values and records an
   * audit entry with the old → new change.
   *
   * Throws:
   *  - NotFoundException  if the role does not exist in the current tenant.
   *  - BadRequestException({code:'VALIDATION_ERROR'}) on unknown presetKey.
   */
  async applyPreset(roleId: string, presetKey: string): Promise<PublicRole> {
    const preset = findPreset(presetKey);
    if (!preset) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Unknown preset key: "${presetKey}". Valid keys are: ${PERMISSION_PRESETS.map((p) => p.key).join(', ')}`,
      });
    }

    // Verify role belongs to this tenant
    const existing = await this.getById(roleId);

    const oldPermissions = existing.permissions;

    await this.assertCanGrant({
      added: preset.permissions.filter((p) => !oldPermissions.includes(p)),
      isAdminChanged: preset.isAdmin !== existing.isAdmin,
    });
    // A preset is a permission change like any other: honour an active
    // ROLE_PERMISSIONS approval workflow (it used to bypass it).
    if (this.approvalGate) {
      await this.approvalGate.requireApprovalIfActive(
        'ROLE_PERMISSIONS',
        roleId,
        { permissions: [...preset.permissions], isAdmin: preset.isAdmin },
        { currentPayload: existing },
      );
    }

    const updated = await this.prisma.roleDefinition.update({
      where: { id: roleId },
      data: {
        permissions: [...preset.permissions],
        isAdmin: preset.isAdmin,
      },
      select: roleSelect,
    });

    await this.audit?.record({
      action: 'UPDATE',
      entityType: 'RoleDefinition',
      entityId: roleId,
      changes: {
        oldPermissions,
        newPermissions: [...preset.permissions],
        oldIsAdmin: existing.isAdmin,
        newIsAdmin: preset.isAdmin,
        presetApplied: presetKey,
      },
    });

    this.invalidateCaches();
    return toPublicRole(updated);
  }

  // ---------------------------------------------------------------------------
  // Hierarchy methods
  // ---------------------------------------------------------------------------

  /**
   * Returns all roles and their inheritance edges for the current tenant.
   * Shape is suitable for rendering a tree: `{ roles, edges }`.
   *
   * Direction note: an edge `{ parentRoleId, childRoleId }` means the child
   * role inherits permissions from the parent — consistent with
   * PermissionResolverService which walks `childRoleId → parentRoleId`.
   */
  async getHierarchy(): Promise<RoleHierarchy> {
    const ctx = RequestContextStore.require();
    const [roles, inheritances] = await Promise.all([
      this.prisma.roleDefinition.findMany({
        where: { organizationId: ctx.organizationId },
        select: roleSelect,
        orderBy: [{ level: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.roleInheritance.findMany({
        where: { organizationId: ctx.organizationId },
        select: { parentRoleId: true, childRoleId: true },
      }),
    ]);
    return {
      roles: roles.map(toPublicRole),
      edges: inheritances,
    };
  }

  /**
   * Cycle-safe BFS over RoleInheritance within the tenant, returning the set
   * of role IDs that are *subordinate* to (i.e. descendants of) the given role.
   *
   * Direction: follows `parentRoleId → childRoleId` edges. This is the
   * inverse traversal from PermissionResolverService (which walks upward from
   * child to parent to *inherit* permissions). Here we walk *downward* from a
   * parent to enumerate which roles are below it in the hierarchy.
   *
   * The starting `roleId` itself is NOT included in the result set.
   */
  async resolveSubordinateRoleIds(roleId: string): Promise<Set<string>> {
    const ctx = RequestContextStore.require();
    const result = new Set<string>();
    const visited = new Set<string>([roleId]);
    const queue: string[] = [roleId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      const edges = await this.prisma.roleInheritance.findMany({
        where: {
          organizationId: ctx.organizationId,
          parentRoleId: current,
        },
        select: { childRoleId: true },
      });

      for (const edge of edges) {
        if (visited.has(edge.childRoleId)) continue;
        visited.add(edge.childRoleId);
        result.add(edge.childRoleId);
        queue.push(edge.childRoleId);
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Audit methods
  // ---------------------------------------------------------------------------

  /**
   * Returns the audit timeline for the given role (AuditLog rows where
   * entityType='RoleDefinition' and entityId=roleId), newest first.
   *
   * Verifies the role exists in the current tenant before querying audit rows
   * (prevents cross-tenant enumeration via audit).
   */
  async getAudit(roleId: string): Promise<unknown[]> {
    // Verify role belongs to this tenant — throws NotFoundException if not.
    await this.getById(roleId);

    const ctx = RequestContextStore.require();
    return this.prisma.auditLog.findMany({
      where: {
        organizationId: ctx.organizationId,
        entityType: 'RoleDefinition',
        entityId: roleId,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
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
