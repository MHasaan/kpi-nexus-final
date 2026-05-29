import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const NOTIFICATION_DIGEST_QUEUE = 'notification-digest';

/** Window over which alerts collapse into a single digest. */
export const DIGEST_WINDOW_MS = 60_000;

export interface NotificationDigestJobData {
  organizationId: string;
  userId: string;
}

/**
 * Alert-fatigue control: collates multiple alerts for a user into one digest.
 * Uses a deterministic, delayed BullMQ job (`digest-<org>-<user>`); because the
 * jobId is stable, repeated `enqueueDigest` calls inside the 60s window collapse
 * onto the single already-scheduled job rather than fanning out N emails.
 */
@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    @InjectQueue(NOTIFICATION_DIGEST_QUEUE) private readonly queue: Queue<NotificationDigestJobData>,
  ) {}

  digestJobId(organizationId: string, userId: string): string {
    // ':' is not allowed in BullMQ custom job IDs.
    return `digest-${organizationId}-${userId}`;
  }

  async enqueueDigest(organizationId: string, userId: string): Promise<void> {
    try {
      await this.queue.add(
        'digest',
        { organizationId, userId },
        {
          delay: DIGEST_WINDOW_MS,
          jobId: this.digestJobId(organizationId, userId),
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      );
    } catch (err) {
      this.logger.warn(`enqueueDigest failed for ${organizationId}/${userId}: ${String(err)}`);
    }
  }
}
