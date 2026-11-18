import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { KPI_TARGET_SYNC_JOB, KPI_TARGET_SYNC_QUEUE } from './kpi-target-sync.producer.js';
import { KpiTargetSyncService } from './kpi-target-sync.service.js';

/**
 * BullMQ worker for the `kpi-target-sync` queue. Runs with no request context:
 * `syncDue` brings each due KPI up to date inside its own organisation.
 */
@Processor(KPI_TARGET_SYNC_QUEUE)
export class KpiTargetSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(KpiTargetSyncProcessor.name);

  constructor(private readonly sync: KpiTargetSyncService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== KPI_TARGET_SYNC_JOB) return;
    const changed = await this.sync.syncDue();
    if (changed > 0) this.logger.log(`KPI target sync updated ${changed} KPI(s)`);
  }
}
