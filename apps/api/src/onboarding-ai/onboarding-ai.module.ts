import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { OnboardingModule } from '../onboarding/onboarding.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RateLimitModule } from '../rate-limit/rate-limit.module.js';
import { OnboardingAiController } from './onboarding-ai.controller.js';
import { OnboardingAiService } from './onboarding-ai.service.js';

/**
 * OnboardingAiModule — the AI co-pilot (generate / assistant / suggest /
 * explain) for the onboarding wizard. Routes through the P5 AiRouter
 * (ONBOARDING_* features), enforces per-mode hourly rate limits via the shared
 * RateLimitService, and logs every interaction.
 */
@Module({
  imports: [PrismaModule, AiModule, RateLimitModule, OnboardingModule],
  controllers: [OnboardingAiController],
  providers: [OnboardingAiService],
  exports: [OnboardingAiService],
})
export class OnboardingAiModule {}
