import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** BullMQ queue name for the personal digest worker. */
export const PERSONAL_DIGEST_QUEUE = 'personal-digest';

/** Stable job name, also the deterministic jobId. */
export const PERSONAL_DIGEST_JOB = 'personal-digest-daily';

/**
 * Cron expression: every hour, on the hour. Each person's digest goes out on the
 * run that falls at 07:00 on their own clock (see PersonalDigestService). It was
 * once a day at 07:00 UTC.
 */
export const PERSONAL_DIGEST_CRON = '0 * * * *';

/**
 * Schedules the hourly digest run on module init; the same jobId on every deploy keeps it to one
 * job. A run registered by an earlier version with another schedule is removed first: left
 * behind, the old daily run would be a second run at 07:00 UTC, racing the hourly one.
 */
@Injectable()
export class PersonalDigestProducer implements OnModuleInit {
  private readonly logger = new Logger(PersonalDigestProducer.name);

  constructor(@InjectQueue(PERSONAL_DIGEST_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      for (const job of await this.queue.getRepeatableJobs()) {
        if ((job.id === PERSONAL_DIGEST_JOB || job.name === PERSONAL_DIGEST_JOB) && job.pattern !== PERSONAL_DIGEST_CRON) {
          await this.queue.removeRepeatableByKey(job.key);
          this.logger.log(`Removed the earlier personal digest schedule (${String(job.pattern)})`);
        }
      }
      await this.queue.add(
        PERSONAL_DIGEST_JOB,
        {},
        { repeat: { pattern: PERSONAL_DIGEST_CRON }, jobId: PERSONAL_DIGEST_JOB, removeOnComplete: 50, removeOnFail: 50 },
      );
      this.logger.log(`Registered personal digest cron (${PERSONAL_DIGEST_CRON})`);
    } catch (err) {
      // Non-fatal: without Redis at boot the job is not scheduled; do not crash the API.
      this.logger.warn(`Failed to register personal digest job: ${String(err)}`);
    }
  }
}
