import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

export const ALERT_EVAL_QUEUE = 'alert-eval';

/** Repeatable cron job name for the NO_DATA staleness scan. */
export const NO_DATA_SCAN_JOB = 'nodata-scan';

export interface AlertEvalJobData {
  organizationId: string;
  kpiId: string;
  dataPointId: string;
  value: number;
  recordedAt: string; // ISO
  targetUserId?: string | null;
}

/**
 * Enqueues KPI evaluations onto the `alert-eval` queue. Called fire-and-forget
 * from KpiDataService after each data-point insert. A deterministic jobId keyed
 * on the data point makes re-enqueues idempotent.
 */
@Injectable()
export class AlertEngineProducer implements OnModuleInit {
  private readonly logger = new Logger(AlertEngineProducer.name);

  constructor(
    @InjectQueue(ALERT_EVAL_QUEUE) private readonly queue: Queue<AlertEvalJobData>,
  ) {}

  /** Register the repeatable NO_DATA scan (every 5 minutes) on boot. */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        NO_DATA_SCAN_JOB,
        {} as AlertEvalJobData,
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: NO_DATA_SCAN_JOB,
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
    } catch (err) {
      this.logger.warn(`Failed to register NO_DATA scan job: ${String(err)}`);
    }
  }

  async enqueueEvaluateKpi(data: AlertEvalJobData): Promise<void> {
    try {
      await this.queue.add('evaluate', data, {
        // BullMQ custom job IDs cannot contain ':'.
        jobId: `eval-${data.dataPointId}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (err) {
      // Non-fatal: a queue hiccup must not fail the data-point write.
      this.logger.warn(`AlertEngineProducer: enqueue failed for kpi ${data.kpiId}: ${String(err)}`);
    }
  }
}
