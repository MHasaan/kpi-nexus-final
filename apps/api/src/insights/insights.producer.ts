import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const INSIGHTS_QUEUE = 'insights';

/** Repeatable cron job name for the daily org-wide insight batch. */
export const INSIGHTS_DAILY_JOB = 'insights-daily-batch';

/**
 * Registers the daily insight-generation cron on demand. NOT registered on boot
 * — it fans AI calls across every org, so it only runs once an admin explicitly
 * schedules it via POST /insights/schedule-daily (avoids surprise AI spend).
 */
@Injectable()
export class InsightsProducer {
  private readonly logger = new Logger(InsightsProducer.name);

  constructor(@InjectQueue(INSIGHTS_QUEUE) private readonly queue: Queue) {}

  /** Idempotently register the repeatable daily batch (02:30 UTC). */
  async scheduleDaily(): Promise<{ scheduled: true; pattern: string }> {
    const pattern = '30 2 * * *';
    await this.queue.add(
      INSIGHTS_DAILY_JOB,
      {},
      { repeat: { pattern }, jobId: INSIGHTS_DAILY_JOB, removeOnComplete: 50, removeOnFail: 50 },
    );
    this.logger.log(`Registered daily insights batch (${pattern})`);
    return { scheduled: true, pattern };
  }
}
