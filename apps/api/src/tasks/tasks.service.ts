import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
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
  ) {}

  async list(query: ListTasksQuery): Promise<PublicTask[]> {
    const ctx = RequestContextStore.require();
    const resolved = await this.resolver.resolveForCurrentPrincipal();

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

    // Entity-bound read visibility: non-admins see only tasks they created or
    // are assigned to. Admins see every task in the tenant.
    if (!resolved.isAdmin) {
      where.OR = [{ createdById: ctx.userId }, { assigneeUserId: ctx.userId }];
    }

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
    const resolved = await this.resolver.resolveForCurrentPrincipal();
    const where: Prisma.TaskWhereInput = { organizationId: ctx.organizationId, kpiId };
    if (!resolved.isAdmin) {
      where.OR = [{ createdById: ctx.userId }, { assigneeUserId: ctx.userId }];
    }
    return this.prisma.task.findMany({ where, select: taskSelect, orderBy: [{ createdAt: 'asc' }] });
  }

  async getById(id: string): Promise<PublicTask> {
    const ctx = RequestContextStore.require();
    const resolved = await this.resolver.resolveForCurrentPrincipal();
    const task = await this.loadInOrg(id);
    if (!resolved.isAdmin && task.createdById !== ctx.userId && task.assigneeUserId !== ctx.userId) {
      // Don't leak existence to users who can't see the task.
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Task not found' });
    }
    return task;
  }

  async create(dto: CreateTaskDto): Promise<PublicTask> {
    const ctx = RequestContextStore.require();
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
    void ctx;
    return updated;
  }

  async remove(id: string): Promise<void> {
    const task = await this.loadInOrg(id);
    await this.assertCanMutate(task, { allowAssignee: false });
    await this.prisma.task.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'Task', entityId: id });
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
