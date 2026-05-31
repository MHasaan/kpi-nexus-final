import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

/** BullMQ queue name for the onboarding cleanup worker. */
export const ONBOARDING_CLEANUP_QUEUE = 'onboarding-cleanup';

/** Stable job name used both as the BullMQ job name and the deterministic jobId. */
export const ONBOARDING_CLEANUP_JOB = 'onboarding-stale-draft-cleanup';

/** Cron expression: daily at 03:00 UTC. */
export const ONBOARDING_CLEANUP_CRON = '0 3 * * *';

/**
 * Auto-schedules the repeatable stale-draft cleanup job on module init.
 * The same jobId is used as the BullMQ jobId so re-deploys are idempotent
 * (BullMQ deduplicates repeatable jobs by their jobId).
 */
@Injectable()
export class OnboardingCleanupProducer implements OnModuleInit {
  private readonly logger = new Logger(OnboardingCleanupProducer.name);

  constructor(
    @InjectQueue(ONBOARDING_CLEANUP_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        ONBOARDING_CLEANUP_JOB,
        {},
        {
          repeat: { pattern: ONBOARDING_CLEANUP_CRON },
          jobId: ONBOARDING_CLEANUP_JOB,
          removeOnComplete: 50,
          removeOnFail: 50,
        },
      );
      this.logger.log(
        `Registered stale-draft cleanup cron (${ONBOARDING_CLEANUP_CRON})`,
      );
    } catch (err) {
      // Non-fatal: if Redis is unavailable at boot the job won't be scheduled.
      // Alert ops but don't crash the API.
      this.logger.warn(
        `Failed to register stale-draft cleanup job: ${String(err)}`,
      );
    }
  }
}
