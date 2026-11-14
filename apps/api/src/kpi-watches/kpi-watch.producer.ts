import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const KPI_WATCH_QUEUE = 'kpi-watch';

export const KPI_WATCH_EVENTS = ['data_point_added', 'threshold_breached', 'anomaly_confirmed', 'status_changed'] as const;
export type KpiWatchEvent = (typeof KPI_WATCH_EVENTS)[number];

export interface KpiWatchJobData {
  organizationId: string;
  kpiId: string;
  event: KpiWatchEvent;
  /** Who caused it (not told); null for system events. */
  actorUserId: string | null;
  /** data_point_added: the point's owner / unit, for each watcher's point-scope check. */
  pointUserId?: string | null;
  pointOrgUnitId?: string | null;
  /** status_changed: the new status. */
  detail?: string;
}

/**
 * Enqueues "something happened on a KPI" for its watchers. Fire-and-forget:
 * a queue hiccup must never fail the write that caused the event.
 */
@Injectable()
export class KpiWatchProducer {
  private readonly logger = new Logger(KpiWatchProducer.name);

  constructor(@InjectQueue(KPI_WATCH_QUEUE) private readonly queue: Queue<KpiWatchJobData>) {}

  async enqueue(job: KpiWatchJobData): Promise<void> {
    try {
      await this.queue.add(job.event, job, { removeOnComplete: 200, removeOnFail: 200 });
    } catch (err) {
      this.logger.warn(`kpi-watch enqueue failed (${job.event} on ${job.kpiId}): ${String(err)}`);
    }
  }
}
