import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { RETENTION_PURGE_JOB, RETENTION_PURGE_QUEUE } from './retention-purge.producer.js';
import { RetentionService } from './retention.service.js';

/**
 * BullMQ worker for the `retention-purge` queue. Runs with no request context:
 * `purgeAll` walks the policies that are turned on, each inside its own
 * organisation.
 */
@Processor(RETENTION_PURGE_QUEUE)
export class RetentionPurgeProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionPurgeProcessor.name);

  constructor(private readonly retention: RetentionService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RETENTION_PURGE_JOB) return;
    const { policies, deleted } = await this.retention.purgeAll();
    this.logger.log(`Retention purge ran ${policies} policy(ies), removed ${deleted} row(s)`);
  }
}
