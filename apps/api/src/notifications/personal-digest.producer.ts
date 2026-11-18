import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** BullMQ queue name for the personal digest worker. */
export const PERSONAL_DIGEST_QUEUE = 'personal-digest';

/** Stable job name, also the deterministic jobId. */
export const PERSONAL_DIGEST_JOB = 'personal-digest-daily';

/** Cron expression: daily at 07:00 UTC. Weekly digests go out on the Monday run. */
export const PERSONAL_DIGEST_CRON = '0 7 * * *';

/** Schedules the daily digest run on module init; the same jobId on every deploy keeps it to one job. */
@Injectable()
export class PersonalDigestProducer implements OnModuleInit {
  private readonly logger = new Logger(PersonalDigestProducer.name);

  constructor(@InjectQueue(PERSONAL_DIGEST_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
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
