import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type {
  CreateDashboardDto,
  UpdateDashboardDto,
} from './dto/dashboard.dto.js';

const dashboardSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  ownerUserId: true,
  ownerRoleId: true,
  isShared: true,
  isDefault: true,
  layout: true,
  version: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  widgets: {
    select: {
      id: true,
      widgetType: true,
      title: true,
      config: true,
      position: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
  },
} satisfies Prisma.DashboardSelect;

export type PublicDashboard = Prisma.DashboardGetPayload<{
  select: typeof dashboardSelect;
}>;

/** Build the weak ETag value for a dashboard row. */
export function buildDashboardEtag(version: number): string {
  return `W/"${version}"`;
}

/**
 * Parse an `If-Match` header value into a numeric version. Accepts the weak
 * ETag form `W/"<int>"` and the strong form `"<int>"`. Returns `null` for
 * an unparseable input.
 */
export function parseIfMatch(header: string | undefined): number | null {
  if (!header) return null;
  const m = header.match(/^(?:W\/)?"(\d+)"$/);
  if (!m) return null;
  return Number.parseInt(m[1]!, 10);
}

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PermissionResolverService,
  ) {}

  /**
   * List dashboards visible to the current principal:
   *   - Admin sees all (non-deleted)
   *   - Otherwise: owner OR isShared = true
   * Role-based sharing (ownerRoleId) lands when the broader role-share
   * UI ships; the column is recorded but not yet filtered on.
   */
  async list(): Promise<PublicDashboard[]> {
    const ctx = RequestContextStore.require();
    const resolved = await this.resolver.resolveForUser(
      ctx.organizationId,
      ctx.userId,
      ctx.roleId,
    );

    const where: Prisma.DashboardWhereInput = {
      organizationId: ctx.organizationId,
      deletedAt: null,
    };
    if (!resolved.isAdmin) {
      where.OR = [
        { ownerUserId: ctx.userId },
        { isShared: true },
      ];
    }

    return this.prisma.dashboard.findMany({
      where,
      select: dashboardSelect,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<PublicDashboard> {
    const ctx = RequestContextStore.require();
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: null },
      select: dashboardSelect,
    });
    if (!dashboard) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
    }
    // Visibility check: admin OR owner OR shared.
    const resolved = await this.resolver.resolveForUser(
      ctx.organizationId,
      ctx.userId,
      ctx.roleId,
    );
    if (!resolved.isAdmin && dashboard.ownerUserId !== ctx.userId && !dashboard.isShared) {
      // Surface as 404 so we don't leak existence.
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
    }
    return dashboard;
  }

  async create(dto: CreateDashboardDto): Promise<PublicDashboard> {
    const ctx = RequestContextStore.require();
    try {
      const created = await this.prisma.dashboard.create({
        data: {
          organizationId: ctx.organizationId,
          name: dto.name,
          description: dto.description,
          ownerUserId: ctx.userId,
          ownerRoleId: dto.ownerRoleId,
          isShared: dto.isShared,
          layout: dto.layout as Prisma.InputJsonValue | undefined,
          createdById: ctx.userId,
        },
        select: dashboardSelect,
      });
      await this.audit.record({
        action: 'CREATE',
        entityType: 'Dashboard',
        entityId: created.id,
        metadata: { name: created.name, isShared: created.isShared },
      });
      return created;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A dashboard with this name already exists',
        });
      }
      throw error;
    }
  }

  /**
   * Update with optimistic concurrency. `expectedVersion` is parsed from the
   * `If-Match` header in the controller. When omitted, we skip the check
   * (lets internal tooling bypass it); when provided and mismatched, we
   * throw 412 carrying the current ETag.
   */
  async update(
    id: string,
    dto: UpdateDashboardDto,
    expectedVersion: number | null,
  ): Promise<PublicDashboard> {
    const existing = await this.getById(id);

    if (expectedVersion !== null && expectedVersion !== existing.version) {
      throw new PreconditionFailedException({
        code: 'PRECONDITION_FAILED',
        message: 'Dashboard was modified by someone else',
        details: {
          currentVersion: existing.version,
          currentEtag: buildDashboardEtag(existing.version),
        },
      });
    }

    try {
      const updated = await this.prisma.dashboard.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isShared: dto.isShared,
          ownerRoleId: dto.ownerRoleId,
          layout: dto.layout as Prisma.InputJsonValue | undefined,
          version: { increment: 1 },
        },
        select: dashboardSelect,
      });
      await this.audit.record({
        action: 'UPDATE',
        entityType: 'Dashboard',
        entityId: updated.id,
        metadata: { name: updated.name, version: updated.version },
      });
      return updated;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A dashboard with this name already exists',
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.getById(id);
    await this.prisma.dashboard.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), deletedById: ctx.userId },
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Dashboard',
      entityId: existing.id,
      metadata: { name: existing.name, soft: true },
    });
  }

  /**
   * Mark a dashboard as the current user's default. Per-user default is
   * modelled as `isDefault = true` AND `ownerUserId = me`. Clears any
   * previously defaulted dashboard for this user.
   */
  async setDefault(id: string): Promise<PublicDashboard> {
    const ctx = RequestContextStore.require();
    const dashboard = await this.getById(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.dashboard.updateMany({
        where: {
          organizationId: ctx.organizationId,
          ownerUserId: ctx.userId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
      await tx.dashboard.update({
        where: { id: dashboard.id },
        data: { isDefault: true, ownerUserId: ctx.userId },
      });
    });

    return this.getById(id);
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
