import { Injectable, Logger } from '@nestjs/common';

import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { TasksService } from '../tasks/tasks.service.js';
import { WebhooksService } from '../webhooks/webhooks.service.js';
import type { WorkflowEvent } from './rule-evaluator.js';

export interface CreateTaskAction {
  kind: 'create_task';
  title: string;
  description?: string;
  assigneeUserId?: string;
  dueAtRelativeHours?: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}
export interface PostWebhookAction {
  kind: 'post_webhook';
  subscriptionId: string;
}
export interface SendNotificationAction {
  kind: 'send_notification';
  channelId: string;
  message: string;
}

export type WorkflowAction = CreateTaskAction | PostWebhookAction | SendNotificationAction;

/**
 * Fires the side effect for a matched workflow action. Each branch is
 * best-effort and fail-soft — a dispatch failure must never break the
 * triggering operation (data-point insert, alert persist, etc.).
 */
@Injectable()
export class ActionDispatcherService {
  private readonly logger = new Logger(ActionDispatcherService.name);

  constructor(
    private readonly tasks: TasksService,
    private readonly webhooks: WebhooksService,
    private readonly email: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  async dispatch(action: WorkflowAction, event: WorkflowEvent, now: Date = new Date()): Promise<void> {
    try {
      switch (action.kind) {
        case 'create_task':
          await this.createTask(action, event, now);
          return;
        case 'post_webhook':
          await this.postWebhook(action, event);
          return;
        case 'send_notification':
          await this.sendNotification(action, event);
          return;
        default:
          this.logger.warn(`Unknown workflow action kind: ${(action as { kind?: string }).kind}`);
          return;
      }
    } catch (err) {
      this.logger.warn(`Workflow action ${(action as { kind?: string }).kind} failed: ${String(err)}`);
    }
  }

  private async createTask(action: CreateTaskAction, event: WorkflowEvent, now: Date): Promise<void> {
    const dueAt = action.dueAtRelativeHours
      ? new Date(now.getTime() + action.dueAtRelativeHours * 3_600_000)
      : undefined;
    await this.tasks.create({
      title: action.title,
      description: action.description,
      assigneeUserId: action.assigneeUserId,
      priority: action.priority,
      dueAt,
      kpiId: event.kind === 'kpi_changed' ? event.kpiId : undefined,
    });
  }

  private async postWebhook(action: PostWebhookAction, event: WorkflowEvent): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.webhooks.dispatchEvent(ctx.organizationId, 'workflow.triggered', {
      subscriptionId: action.subscriptionId,
      event,
    });
  }

  private async sendNotification(action: SendNotificationAction, event: WorkflowEvent): Promise<void> {
    const ctx = RequestContextStore.require();
    const channel = await this.prisma.notificationChannel.findFirst({
      where: { id: action.channelId, organizationId: ctx.organizationId, isActive: true },
      select: { id: true, kind: true, config: true },
    });
    if (!channel) {
      this.logger.warn(`send_notification: channel ${action.channelId} not found`);
      return;
    }
    if (channel.kind === 'EMAIL') {
      const config = (channel.config as { recipients?: string[]; to?: string }) ?? {};
      const recipients = config.recipients ?? (config.to ? [config.to] : []);
      for (const to of recipients) {
        await this.email.send({
          to,
          subject: 'KPI Nexus workflow notification',
          html: `<p>${action.message}</p>`,
          text: action.message,
        });
      }
      return;
    }
    this.logger.log(`send_notification: channel kind ${channel.kind} not yet supported; event=${event.kind}`);
  }
}
