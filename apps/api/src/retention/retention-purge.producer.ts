import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** BullMQ queue name for the retention purge worker. */
export const RETENTION_PURGE_QUEUE = 'retention-purge';

/** Stable job name, also the deterministic jobId. */
export const RETENTION_PURGE_JOB = 'retention-daily-purge';

/** Cron expression: daily at 03:30 UTC. */
export const RETENTION_PURGE_CRON = '30 3 * * *';

/**
 * Schedules the daily retention purge on module init. The same jobId on every
 * deploy keeps it to one repeatable job. The purge itself only touches policies
 * an administrator has turned purging on for.
 */
@Injectable()
export class RetentionPurgeProducer implements OnModuleInit {
  private readonly logger = new Logger(RetentionPurgeProducer.name);

  constructor(@InjectQueue(RETENTION_PURGE_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        RETENTION_PURGE_JOB,
        {},
        { repeat: { pattern: RETENTION_PURGE_CRON }, jobId: RETENTION_PURGE_JOB, removeOnComplete: 50, removeOnFail: 50 },
      );
      this.logger.log(`Registered retention purge cron (${RETENTION_PURGE_CRON})`);
    } catch (err) {
      // Non-fatal: without Redis at boot the job is not scheduled; do not crash the API.
      this.logger.warn(`Failed to register retention purge job: ${String(err)}`);
    }
  }
}
