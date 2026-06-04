import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
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
    private readonly accessContext: AccessContextService,
  ) {}

  /**
   * List dashboards visible to the current principal — see {@link visibilityWhere}.
   * Role-based sharing (ownerRoleId) lands when the broader role-share
   * UI ships; the column is recorded but not yet filtered on.
   */
  async list(): Promise<PublicDashboard[]> {
    const where = await this.visibilityWhere();
    return this.prisma.dashboard.findMany({
      where,
      select: dashboardSelect,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  /**
   * The dashboard `where` for the current principal. `isShared` is an always-on
   * floor; the configured DASHBOARDS scope governs the *private* set (SELF=own,
   * DIRECT_REPORTS=+reports, UNITS=+unit owners/assignments, ORG=all). Default
   * SELF ⇒ own ∪ isShared = parity. Admin ⇒ whole tenant.
   */
  private async visibilityWhere(
    deletedAt: Prisma.DashboardWhereInput['deletedAt'] = null,
  ): Promise<Prisma.DashboardWhereInput> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    const where: Prisma.DashboardWhereInput = {
      organizationId: ctx.organizationId,
      deletedAt,
    };
    if (profile.isAdmin) return where;

    // AccessContextService always populates every domain; coalesce defensively for the
    // Partial<Record> type (z.record ⇒ value is Scope | undefined) ⇒ parity default SELF.
    const scope = profile.scopeByDomain.DASHBOARDS ?? 'SELF';
    if (scope === 'ORG') return where; // all dashboards in tenant

    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ownerIds = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!; // non-null: scope !== ORG
    const or: Prisma.DashboardWhereInput[] = [
      { ownerUserId: { in: ownerIds } },
      { isShared: true },
    ];
    // Unit-published dashboards surface only at UNITS scope (by design — DIRECT_REPORTS
    // widens by people, not by unit membership).
    if (scope === 'UNITS') {
      const myUnitIds = [
        ...new Set([...profile.context.managedOrgUnitIds, ...profile.context.memberOrgUnitIds]),
      ];
      if (myUnitIds.length > 0) {
        or.push({ unitAssignments: { some: { orgUnitId: { in: myUnitIds } } } });
      }
    }
    where.OR = or;
    return where;
  }

  async getById(id: string): Promise<PublicDashboard> {
    const where = await this.visibilityWhere();
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { ...where, id },
      select: dashboardSelect,
    });
    if (!dashboard) {
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

  /** List soft-deleted (archived) dashboards visible to the current principal —
   *  same DASHBOARDS-scope predicate as list(), but for deletedAt != null. */
  async listArchived(): Promise<PublicDashboard[]> {
    const where = await this.visibilityWhere({ not: null });
    return this.prisma.dashboard.findMany({
      where,
      select: dashboardSelect,
      orderBy: { deletedAt: 'desc' },
    });
  }

  /** Restore a soft-deleted dashboard (set deletedAt = null). Throws 404 if not
   *  found in tenant or not currently archived. */
  async restore(id: string): Promise<PublicDashboard> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.dashboard.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Archived dashboard not found' });
    }
    await this.prisma.dashboard.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Dashboard',
      entityId: id,
      metadata: { name: existing.name, restored: true },
    });
    return this.prisma.dashboard.findUniqueOrThrow({ where: { id }, select: dashboardSelect });
  }

  /** Hard-delete a soft-deleted dashboard. Related rows (widgets, snapshots,
   *  shareLinks) cascade via FK onDelete:Cascade in the Prisma schema, so no
   *  explicit child deletion is needed. Throws 404 if not found in tenant or not
   *  currently archived. */
  async purge(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.dashboard.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Archived dashboard not found' });
    }
    await this.prisma.dashboard.delete({ where: { id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'Dashboard',
      entityId: id,
      metadata: { name: existing.name, purged: true },
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

  /** List the org units a dashboard is published to (caller must be able to see it). */
  async listUnitAssignments(
    dashboardId: string,
  ): Promise<Array<{ orgUnitId: string; createdAt: Date }>> {
    await this.getById(dashboardId); // visibility-gates: 404 if not visible to caller
    return this.prisma.dashboardAssignmentOrgUnit.findMany({
      where: { dashboardId },
      select: { orgUnitId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Publish a dashboard to an org unit (DASHBOARD_MANAGE). Idempotent on (dashboard, unit). */
  async assignUnit(dashboardId: string, orgUnitId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.getById(dashboardId); // tenant + visibility check
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id: orgUnitId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Org unit not found' });
    await this.prisma.dashboardAssignmentOrgUnit.upsert({
      where: { dashboardId_orgUnitId: { dashboardId, orgUnitId } },
      create: { organizationId: ctx.organizationId, dashboardId, orgUnitId, createdById: ctx.userId },
      update: {},
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Dashboard',
      entityId: dashboardId,
      metadata: { assignedUnit: orgUnitId },
    });
  }

  /** Un-publish a dashboard from an org unit (DASHBOARD_MANAGE). */
  async unassignUnit(dashboardId: string, orgUnitId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.getById(dashboardId);
    await this.prisma.dashboardAssignmentOrgUnit.deleteMany({
      where: { organizationId: ctx.organizationId, dashboardId, orgUnitId },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'Dashboard',
      entityId: dashboardId,
      metadata: { unassignedUnit: orgUnitId },
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
