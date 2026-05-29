import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export const OUTBOUND_WEBHOOK_QUEUE = 'outbound-webhook';

export interface OutboundWebhookJobData {
  webhookId: string;
  organizationId: string;
  event: string;
  payload: unknown;
}

const publicSelect = {
  id: true,
  organizationId: true,
  name: true,
  url: true,
  events: true,
  isActive: true,
  lastDeliveredAt: true,
  lastStatus: true,
  failureCount: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.WebhookSubscriptionSelect;

export type PublicWebhook = Prisma.WebhookSubscriptionGetPayload<{ select: typeof publicSelect }>;

function newSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @InjectQueue(OUTBOUND_WEBHOOK_QUEUE) private readonly queue: Queue<OutboundWebhookJobData>,
  ) {}

  async list(): Promise<PublicWebhook[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.webhookSubscription.findMany({
      where: { organizationId: ctx.organizationId },
      select: publicSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  /** Create returns the public row PLUS the plaintext secret (shown once). */
  async create(input: {
    name: string;
    url: string;
    events: string[];
  }): Promise<{ webhook: PublicWebhook; secret: string }> {
    const ctx = RequestContextStore.require();
    const secret = newSecret();
    const webhook = await this.prisma.webhookSubscription.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        url: input.url,
        events: input.events,
        secret,
        createdById: ctx.userId,
      },
      select: publicSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'WebhookSubscription',
      entityId: webhook.id,
      metadata: { name: webhook.name, events: webhook.events },
    });
    return { webhook, secret };
  }

  async rotateSecret(id: string): Promise<{ webhook: PublicWebhook; secret: string }> {
    await this.requireInTenant(id);
    const secret = newSecret();
    const webhook = await this.prisma.webhookSubscription.update({
      where: { id },
      data: { secret },
      select: publicSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'WebhookSubscription', entityId: id, metadata: { rotatedSecret: true } });
    return { webhook, secret };
  }

  async setActive(id: string, isActive: boolean): Promise<PublicWebhook> {
    await this.requireInTenant(id);
    const webhook = await this.prisma.webhookSubscription.update({
      where: { id },
      data: { isActive },
      select: publicSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'WebhookSubscription', entityId: id, metadata: { isActive } });
    return webhook;
  }

  async remove(id: string): Promise<void> {
    await this.requireInTenant(id);
    await this.prisma.webhookSubscription.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'WebhookSubscription', entityId: id });
  }

  /** Manually fire a test event to a single webhook. */
  async test(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.requireInTenant(id);
    await this.enqueue(id, ctx.organizationId, 'webhook.test', {
      message: 'This is a test delivery from KPI Nexus',
      at: new Date().toISOString(),
    });
  }

  /**
   * Fan out an event to every active subscription in the org whose `events`
   * list includes it. Called by the realtime/alert layer.
   */
  async dispatchEvent(organizationId: string, event: string, payload: unknown): Promise<void> {
    const subs = await this.prisma.webhookSubscription.findMany({
      where: { organizationId, isActive: true, events: { has: event } },
      select: { id: true },
    });
    await Promise.all(subs.map((s) => this.enqueue(s.id, organizationId, event, payload)));
  }

  private async enqueue(
    webhookId: string,
    organizationId: string,
    event: string,
    payload: unknown,
  ): Promise<void> {
    try {
      await this.queue.add(
        'deliver',
        { webhookId, organizationId, event, payload },
        {
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    } catch (err) {
      this.logger.warn(`WebhooksService: enqueue failed for webhook ${webhookId}: ${String(err)}`);
    }
  }

  private async requireInTenant(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const row = await this.prisma.webhookSubscription.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Webhook not found' });
    }
  }
}
