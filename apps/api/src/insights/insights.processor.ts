import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { InsightsService } from './insights.service.js';
import { INSIGHTS_DAILY_JOB, INSIGHTS_QUEUE } from './insights.producer.js';

/**
 * BullMQ worker for the daily insights batch. The job carries no payload; the
 * service fans out across every org under its own system context.
 */
@Processor(INSIGHTS_QUEUE)
export class InsightsProcessor extends WorkerHost {
  private readonly logger = new Logger(InsightsProcessor.name);

  constructor(private readonly insights: InsightsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === INSIGHTS_DAILY_JOB) {
      const made = await this.insights.generateBatchAllOrgs();
      this.logger.log(`daily insights batch generated ${made} insight(s)`);
    }
  }
}
