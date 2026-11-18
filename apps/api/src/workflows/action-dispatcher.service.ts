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

/** The automation an action belongs to, so what it makes can say where it came from. */
export interface ActionSource {
  name: string;
  /** "Run now": nobody recorded a value, a person pressed the button. */
  byHand?: boolean;
}

/** One line for a task made by an automation: which one, and what set it off. */
export function madeBy(source: ActionSource, event: WorkflowEvent): string {
  const who = `Made by the automation "${source.name}"`;
  if (source.byHand) return `${who}, run by hand.`;
  return event.kind === 'kpi_changed'
    ? `${who} when a value of ${event.value} was recorded.`
    : `${who} when an alert was raised.`;
}

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

  /**
   * Fire-and-forget: used when an event (a recorded value, an alert) matches a
   * workflow. A failure is logged and swallowed, because it must never break
   * the operation that triggered it.
   */
  async dispatch(action: WorkflowAction, event: WorkflowEvent, now: Date = new Date(), source?: ActionSource): Promise<void> {
    try {
      await this.run(action, event, now, source);
    } catch (err) {
      this.logger.warn(`Workflow action ${(action as { kind?: string }).kind} failed: ${String(err)}`);
    }
  }

  /**
   * Do the action and let a failure be seen. Used by "Run now", where the
   * person pressing the button is waiting to hear whether it worked.
   */
  async run(action: WorkflowAction, event: WorkflowEvent, now: Date = new Date(), source?: ActionSource): Promise<void> {
    switch (action.kind) {
      case 'create_task':
        await this.createTask(action, event, now, source);
        return;
      case 'post_webhook':
        await this.postWebhook(action, event);
        return;
      case 'send_notification':
        await this.sendNotification(action, event);
        return;
      default:
        throw new Error(`Unknown workflow action kind: ${String((action as { kind?: string }).kind)}`);
    }
  }

  private async createTask(action: CreateTaskAction, event: WorkflowEvent, now: Date, source?: ActionSource): Promise<void> {
    const dueAt = action.dueAtRelativeHours
      ? new Date(now.getTime() + action.dueAtRelativeHours * 3_600_000)
      : undefined;
    await this.tasks.create({
      title: action.title,
      // Without this the task arrives with a title and nothing else: nobody opening it can tell why it exists.
      description: [action.description, source ? madeBy(source, event) : undefined].filter(Boolean).join('\n\n') || undefined,
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
    if (!channel) throw new Error('The notification channel no longer exists or is switched off');
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
