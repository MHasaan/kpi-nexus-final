import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { signWebhook } from './webhooks-signing.js';
import { OUTBOUND_WEBHOOK_QUEUE, type OutboundWebhookJobData } from './webhooks.service.js';

const AUTO_DISABLE_THRESHOLD = 100;

/**
 * Delivers outbound webhooks. POSTs the JSON body with an HMAC signature
 * header, retries on 5xx/network errors (BullMQ exponential backoff, 5
 * attempts), tracks lastStatus + failureCount, and auto-disables a webhook
 * after sustained failures.
 */
@Processor(OUTBOUND_WEBHOOK_QUEUE)
export class OutboundWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(OutboundWebhookProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<OutboundWebhookJobData>): Promise<void> {
    const { webhookId, organizationId, event, payload } = job.data;

    await RequestContextStore.run(
      {
        userId: 'webhook-system',
        organizationId,
        roleId: null,
        principalType: 'user',
        bypassRls: true,
      },
      async () => {
        const webhook = await this.prisma.webhookSubscription.findFirst({
          where: { id: webhookId, organizationId },
        });
        if (!webhook || !webhook.isActive) {
          this.logger.debug(`Webhook ${webhookId} missing/inactive — skipping delivery`);
          return;
        }

        const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });
        const ts = Math.floor(Date.now() / 1000);
        const signature = signWebhook(webhook.secret, ts, body);

        let status: number | null = null;
        let ok = false;
        try {
          const res = await fetch(webhook.url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'X-KpiNexus-Event': event,
              'X-KpiNexus-Timestamp': String(ts),
              'X-KpiNexus-Signature': signature,
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          status = res.status;
          ok = res.ok;
        } catch (err) {
          this.logger.warn(`Webhook ${webhookId} delivery error: ${String(err)}`);
        }

        if (ok) {
          await this.prisma.webhookSubscription.update({
            where: { id: webhookId },
            data: { lastDeliveredAt: new Date(), lastStatus: status, failureCount: 0 },
          });
          return;
        }

        // Failure: bump counter, record status, auto-disable past threshold.
        const updated = await this.prisma.webhookSubscription.update({
          where: { id: webhookId },
          data: { lastStatus: status, failureCount: { increment: 1 } },
          select: { failureCount: true },
        });
        if (updated.failureCount >= AUTO_DISABLE_THRESHOLD) {
          await this.prisma.webhookSubscription.update({
            where: { id: webhookId },
            data: { isActive: false },
          });
          this.logger.warn(`Webhook ${webhookId} auto-disabled after ${updated.failureCount} failures`);
        }
        // Throw so BullMQ retries with backoff (until attempts exhausted).
        throw new Error(`Webhook delivery failed (status ${status ?? 'network-error'})`);
      },
    );
  }
}
