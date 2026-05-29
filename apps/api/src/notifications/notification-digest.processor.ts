import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  NOTIFICATION_DIGEST_QUEUE,
  type NotificationDigestJobData,
} from './notification-digest.service.js';

/**
 * Fires once per (org,user) digest window: counts the user's still-OPEN alerts
 * over the last 24h and publishes an `alert_digest` realtime event with the
 * summary. (Email digest delivery hooks in here once per-user prefs land.)
 */
@Processor(NOTIFICATION_DIGEST_QUEUE)
export class NotificationDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDigestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(job: Job<NotificationDigestJobData>): Promise<void> {
    const { organizationId, userId } = job.data;
    await RequestContextStore.run(
      {
        userId: 'digest-system',
        organizationId,
        roleId: null,
        principalType: 'user',
        bypassRls: true,
      },
      async () => {
        const since = new Date(Date.now() - 24 * 60 * 60_000);
        const openCount = await this.prisma.alert.count({
          where: {
            organizationId,
            status: 'OPEN',
            createdAt: { gte: since },
            OR: [{ targetUserId: userId }, { targetUserId: null }],
          },
        });
        if (openCount === 0) return;
        try {
          await this.realtime.publish(organizationId, {
            type: 'alert_digest',
            userId,
            openCount,
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          this.logger.warn(`alert_digest publish failed for ${organizationId}/${userId}: ${String(err)}`);
        }
      },
    );
  }
}
