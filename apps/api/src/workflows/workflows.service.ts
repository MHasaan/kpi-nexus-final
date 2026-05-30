import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ActionDispatcherService, type WorkflowAction } from './action-dispatcher.service.js';
import type { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto.js';
import { type WorkflowEvent, evaluateRule } from './rule-evaluator.js';

export type WorkflowTrigger = 'kpi_changed' | 'schedule' | 'alert' | 'manual';

const workflowSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  triggers: true,
  rule: true,
  action: true,
  isActive: true,
  scheduleCron: true,
  lastRunAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkflowSelect;

export type PublicWorkflow = Prisma.WorkflowGetPayload<{ select: typeof workflowSelect }>;

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dispatcher: ActionDispatcherService,
  ) {}

  async list(): Promise<PublicWorkflow[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.workflow.findMany({
      where: { organizationId: ctx.organizationId },
      select: workflowSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async getById(id: string): Promise<PublicWorkflow> {
    const ctx = RequestContextStore.require();
    const wf = await this.prisma.workflow.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: workflowSelect,
    });
    if (!wf) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Workflow not found' });
    return wf;
  }

  async create(dto: CreateWorkflowDto): Promise<PublicWorkflow> {
    const ctx = RequestContextStore.require();
    const created = await this.prisma.workflow.create({
      data: {
        organizationId: ctx.organizationId,
        name: dto.name,
        description: dto.description,
        triggers: dto.triggers,
        rule: (dto.rule ?? undefined) as Prisma.InputJsonValue | undefined,
        action: dto.action as Prisma.InputJsonValue,
        isActive: dto.isActive,
        scheduleCron: dto.scheduleCron,
        createdById: ctx.userId,
      },
      select: workflowSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'Workflow', entityId: created.id, metadata: { name: created.name } });
    return created;
  }

  async update(id: string, dto: UpdateWorkflowDto): Promise<PublicWorkflow> {
    await this.getById(id);
    const updated = await this.prisma.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        triggers: dto.triggers,
        rule: dto.rule === undefined ? undefined : (dto.rule as Prisma.InputJsonValue),
        action: dto.action as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
        scheduleCron: dto.scheduleCron,
      },
      select: workflowSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Workflow', entityId: id });
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.workflow.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'Workflow', entityId: id });
  }

  /** Manually fire a workflow (for the `manual` trigger type / Test button). */
  async trigger(id: string, event: WorkflowEvent): Promise<void> {
    const wf = await this.getById(id);
    await this.runWorkflow(wf, event);
  }

  /**
   * Evaluate every active workflow subscribed to `trigger` against `event` and
   * dispatch matching actions. Fire-and-forget friendly — never throws.
   */
  async runEvent(trigger: WorkflowTrigger, event: WorkflowEvent): Promise<void> {
    const ctx = RequestContextStore.get();
    if (!ctx) return;
    const workflows = await this.prisma.workflow.findMany({
      where: { organizationId: ctx.organizationId, isActive: true, triggers: { has: trigger } },
      select: workflowSelect,
    });
    for (const wf of workflows) {
      await this.runWorkflow(wf, event);
    }
  }

  private async runWorkflow(wf: PublicWorkflow, event: WorkflowEvent): Promise<void> {
    try {
      if (!evaluateRule(wf.rule, event)) return;
      await this.dispatcher.dispatch(wf.action as unknown as WorkflowAction, event);
      await this.prisma.workflow.update({ where: { id: wf.id }, data: { lastRunAt: new Date() } });
    } catch (err) {
      this.logger.warn(`Workflow ${wf.id} run failed: ${String(err)}`);
    }
  }
}
