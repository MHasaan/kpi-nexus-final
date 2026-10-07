import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
import { assertSameTenant } from '../tenancy/assert-same-tenant.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateTaskDto, ListTasksQuery, UpdateTaskDto } from './dto/task.dto.js';

const taskSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  alertId: true,
  title: true,
  description: true,
  assigneeUserId: true,
  dueAt: true,
  status: true,
  priority: true,
  externalRef: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

export type PublicTask = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: PermissionResolverService,
    private readonly accessContext: AccessContextService,
  ) {}

  /**
   * OR-clause restricting tasks to those created-by / assigned-to the scoped user
   * set for the current principal's TASKS scope. `undefined` ⇒ no restriction
   * (ORG / admin). Default scope SELF ⇒ ids = [me] ⇒ own-created ∪ own-assigned (parity).
   */
  private async taskScopeOr(): Promise<Prisma.TaskWhereInput[] | undefined> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return undefined;
    const scope = profile.scopeByDomain.TASKS ?? 'SELF';
    if (scope === 'ORG') return undefined;
    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ids = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!; // non-null: scope !== ORG
    return [{ createdById: { in: ids } }, { assigneeUserId: { in: ids } }];
  }

  async list(query: ListTasksQuery): Promise<PublicTask[]> {
    const ctx = RequestContextStore.require();

    const where: Prisma.TaskWhereInput = { organizationId: ctx.organizationId };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.assigneeUserId) where.assigneeUserId = query.assigneeUserId;
    if (query.kpiId) where.kpiId = query.kpiId;
    if (query.dueBefore || query.dueAfter) {
      where.dueAt = {
        ...(query.dueAfter ? { gte: query.dueAfter } : {}),
        ...(query.dueBefore ? { lte: query.dueBefore } : {}),
      };
    }

    // Read visibility driven by the AccessProfile's TASKS scope (default SELF = parity).
    const or = await this.taskScopeOr();
    if (or) where.OR = or;

    return this.prisma.task.findMany({
      where,
      select: taskSelect,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async myTasks(): Promise<PublicTask[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.task.findMany({
      where: { organizationId: ctx.organizationId, assigneeUserId: ctx.userId },
      select: taskSelect,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async byKpi(kpiId: string): Promise<PublicTask[]> {
    const ctx = RequestContextStore.require();
    const where: Prisma.TaskWhereInput = { organizationId: ctx.organizationId, kpiId };
    const or = await this.taskScopeOr();
    if (or) where.OR = or;
    return this.prisma.task.findMany({ where, select: taskSelect, orderBy: [{ createdAt: 'asc' }] });
  }

  async getById(id: string): Promise<PublicTask> {
    const task = await this.loadInOrg(id);
    const or = await this.taskScopeOr();
    if (or) {
      const ids = (or[0] as { createdById: { in: string[] } }).createdById.in;
      if (!ids.includes(task.createdById) && !ids.includes(task.assigneeUserId ?? '')) {
        // Don't leak existence to users who can't see the task.
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
      }
    }
    return task;
  }

  async create(dto: CreateTaskDto): Promise<PublicTask> {
    const ctx = RequestContextStore.require();
    await this.assertRefsInTenant(dto, ctx.organizationId);
    const created = await this.prisma.task.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId: dto.kpiId,
        alertId: dto.alertId,
        title: dto.title,
        description: dto.description,
        assigneeUserId: dto.assigneeUserId,
        dueAt: dto.dueAt,
        status: dto.status,
        priority: dto.priority,
        externalRef: dto.externalRef,
        createdById: ctx.userId,
      },
      select: taskSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'Task', entityId: created.id, metadata: { title: created.title } });
    return created;
  }

  async update(id: string, dto: UpdateTaskDto): Promise<PublicTask> {
    const ctx = RequestContextStore.require();
    const task = await this.loadInOrg(id);
    await this.assertCanMutate(task, { allowAssignee: true });
    await this.assertRefsInTenant(dto, ctx.organizationId);
    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        kpiId: dto.kpiId,
        alertId: dto.alertId,
        assigneeUserId: dto.assigneeUserId,
        dueAt: dto.dueAt,
        status: dto.status,
        priority: dto.priority,
        externalRef: dto.externalRef,
      },
      select: taskSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Task', entityId: id, metadata: { status: updated.status } });
    return updated;
  }

  async remove(id: string): Promise<void> {
    const task = await this.loadInOrg(id);
    await this.assertCanMutate(task, { allowAssignee: false });
    await this.prisma.task.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'Task', entityId: id });
  }

  /** BE-021: a task may only point at a KPI / alert / assignee of its own tenant. */
  private async assertRefsInTenant(
    dto: { kpiId?: string | null; alertId?: string | null; assigneeUserId?: string | null },
    organizationId: string,
  ): Promise<void> {
    if (dto.kpiId) await assertSameTenant(this.prisma, 'kPI', dto.kpiId, organizationId, 'kpiId');
    if (dto.alertId) await assertSameTenant(this.prisma, 'alert', dto.alertId, organizationId, 'alertId');
    if (dto.assigneeUserId) await assertSameTenant(this.prisma, 'user', dto.assigneeUserId, organizationId, 'assigneeUserId');
  }

  /** Fetch a task scoped to the tenant; 404 if absent. No read-visibility check. */
  private async loadInOrg(id: string): Promise<PublicTask> {
    const ctx = RequestContextStore.require();
    const task = await this.prisma.task.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: taskSelect,
    });
    if (!task) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
    return task;
  }

  /**
   * Mutate gate: creator, USERS_MANAGE holders, and admins always pass. The
   * assignee may edit (status updates) but may not delete.
   */
  private async assertCanMutate(task: PublicTask, opts: { allowAssignee: boolean }): Promise<void> {
    const ctx = RequestContextStore.require();
    if (task.createdById === ctx.userId) return;
    if (opts.allowAssignee && task.assigneeUserId === ctx.userId) return;
    const resolved = await this.resolver.resolveForCurrentPrincipal();
    if (resolved.isAdmin || resolved.permissions.has(PermissionKey.USERS_MANAGE)) return;
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You cannot modify this task' });
  }
}
