import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OrgTemplatesModule } from '../org-templates/org-templates.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OnboardingCleanupProcessor } from './onboarding-cleanup.processor.js';
import {
  ONBOARDING_CLEANUP_QUEUE,
  OnboardingCleanupProducer,
} from './onboarding-cleanup.producer.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';
import { queueProcessors } from '../config/queue-workers.js';

/**
 * OnboardingModule — the wizard backend: resumable drafts + atomic org
 * materialization (template → real org). Public (pre-auth); draft access gated
 * by a per-session draft token. Reuses AuthService for JWT issuance and
 * OrgTemplatesService for template application.
 *
 * Also registers the `onboarding-cleanup` BullMQ queue + a cron-based
 * processor that archives stale in_progress drafts daily at 03:00 UTC.
 */
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    OrgTemplatesModule,
    BullModule.registerQueue({ name: ONBOARDING_CLEANUP_QUEUE }),
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    OnboardingCleanupProducer,
    ...queueProcessors([OnboardingCleanupProcessor]),
  ],
  exports: [OnboardingService],
})
export class OnboardingModule {}
