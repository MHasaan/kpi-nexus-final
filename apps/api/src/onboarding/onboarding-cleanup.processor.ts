import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { OnboardingService } from './onboarding.service.js';
import {
  ONBOARDING_CLEANUP_JOB,
  ONBOARDING_CLEANUP_QUEUE,
} from './onboarding-cleanup.producer.js';

/**
 * BullMQ worker for the `onboarding-cleanup` queue. Runs without a request
 * context — cleanupStale() is a system-wide maintenance operation that uses
 * Prisma directly without tenant scoping.
 */
@Processor(ONBOARDING_CLEANUP_QUEUE)
export class OnboardingCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(OnboardingCleanupProcessor.name);

  constructor(private readonly onboarding: OnboardingService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ONBOARDING_CLEANUP_JOB) return;

    const { cleaned } = await this.onboarding.cleanupStale();
    this.logger.log(`Stale-draft cleanup archived ${cleaned} session(s)`);
  }
}
