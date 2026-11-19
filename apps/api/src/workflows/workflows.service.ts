import { BadRequestException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { ActionDispatcherService, type WorkflowAction } from './action-dispatcher.service.js';
import type { CreateWorkflowDto, UpdateWorkflowDto, WorkflowActionDto, WorkflowRuleDto } from './dto/workflow.dto.js';
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

  /**
   * A rule and an action name things by id — a KPI, a person, a channel, a
   * webhook. Each must exist in this organisation: otherwise the workflow is
   * saved and then silently never does anything (or reaches into another
   * tenant's ids).
   */
  private async assertReferences(rule: WorkflowRuleDto | null | undefined, action: WorkflowActionDto | undefined): Promise<void> {
    const { organizationId } = RequestContextStore.require();
    const missing = (what: string): never => {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `${what} was not found in this organization` });
    };
    if (rule && 'kpiId' in rule) {
      const kpi = await this.prisma.kPI.findFirst({ where: { id: rule.kpiId, organizationId, deletedAt: null }, select: { id: true } });
      if (!kpi) missing('The KPI in the condition');
    }
    if (action?.kind === 'create_task' && action.assigneeUserId) {
      const user = await this.prisma.user.findFirst({ where: { id: action.assigneeUserId, organizationId }, select: { id: true } });
      if (!user) missing('The person to assign the task to');
    }
    if (action?.kind === 'send_notification') {
      const channel = await this.prisma.notificationChannel.findFirst({ where: { id: action.channelId, organizationId }, select: { id: true } });
      if (!channel) missing('The notification channel');
    }
    if (action?.kind === 'post_webhook') {
      const subscription = await this.prisma.webhookSubscription.findFirst({ where: { id: action.subscriptionId, organizationId }, select: { id: true } });
      if (!subscription) missing('The webhook');
    }
  }

  async create(dto: CreateWorkflowDto): Promise<PublicWorkflow> {
    const ctx = RequestContextStore.require();
    await this.assertReferences(dto.rule, dto.action);
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
    await this.assertReferences(dto.rule, dto.action);
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

  /**
   * "Run now": do the workflow's action once, whatever its condition says.
   * It used to evaluate the rule against a made-up event (KPI "manual", value
   * 0), which no rule matches — so the button did nothing and said nothing.
   * A failure is reported, not swallowed: someone is waiting for the answer.
   */
  async trigger(id: string): Promise<void> {
    const wf = await this.getById(id);
    const rule = wf.rule as { kpiId?: unknown } | null;
    const event: WorkflowEvent =
      rule && typeof rule.kpiId === 'string'
        ? { kind: 'kpi_changed', kpiId: rule.kpiId, value: await this.latestValue(rule.kpiId) }
        : { kind: 'alert', severity: 'LOW' };
    try {
      await this.dispatcher.run(wf.action as unknown as WorkflowAction, event, new Date(), { name: wf.name, byHand: true });
    } catch (err) {
      throw new UnprocessableEntityException({
        code: 'WORKFLOW_ACTION_FAILED',
        message: `The action could not be run: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    await this.prisma.workflow.update({ where: { id: wf.id }, data: { lastRunAt: new Date() } });
    await this.audit.record({ action: 'UPDATE', entityType: 'Workflow', entityId: id, metadata: { manualRun: true } });
  }

  /** The newest recorded value of a KPI, or 0 when it has none. */
  private async latestValue(kpiId: string): Promise<number> {
    const { organizationId } = RequestContextStore.require();
    const point = await this.prisma.kPIDataPoint.findFirst({
      where: { kpiId, organizationId },
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      select: { value: true },
    });
    return point ? Number(point.value) : 0;
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
      await this.dispatcher.dispatch(wf.action as unknown as WorkflowAction, event, new Date(), { name: wf.name });
      await this.prisma.workflow.update({ where: { id: wf.id }, data: { lastRunAt: new Date() } });
    } catch (err) {
      this.logger.warn(`Workflow ${wf.id} run failed: ${String(err)}`);
    }
  }
}
