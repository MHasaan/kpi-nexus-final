import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** BullMQ queue name for the target sweep. */
export const KPI_TARGET_SYNC_QUEUE = 'kpi-target-sync';

/** Stable job name, also the deterministic jobId. */
export const KPI_TARGET_SYNC_JOB = 'kpi-target-hourly-sync';

/** Cron expression: ten past every hour. */
export const KPI_TARGET_SYNC_CRON = '10 * * * *';

/**
 * Schedules the hourly target sweep on module init: a target with a start or an
 * end date takes effect, or stops, when that time comes — without anyone
 * touching it. The same jobId on every deploy keeps it to one repeatable job.
 */
@Injectable()
export class KpiTargetSyncProducer implements OnModuleInit {
  private readonly logger = new Logger(KpiTargetSyncProducer.name);

  constructor(@InjectQueue(KPI_TARGET_SYNC_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        KPI_TARGET_SYNC_JOB,
        {},
        { repeat: { pattern: KPI_TARGET_SYNC_CRON }, jobId: KPI_TARGET_SYNC_JOB, removeOnComplete: 50, removeOnFail: 50 },
      );
      this.logger.log(`Registered KPI target sync cron (${KPI_TARGET_SYNC_CRON})`);
    } catch (err) {
      // Non-fatal: without Redis at boot the job is not scheduled; do not crash the API.
      this.logger.warn(`Failed to register KPI target sync job: ${String(err)}`);
    }
  }
}
