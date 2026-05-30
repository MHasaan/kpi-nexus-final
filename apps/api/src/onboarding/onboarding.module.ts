import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { OrgTemplatesModule } from '../org-templates/org-templates.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

/**
 * OnboardingModule — the wizard backend: resumable drafts + atomic org
 * materialization (template → real org). Public (pre-auth); draft access gated
 * by a per-session draft token. Reuses AuthService for JWT issuance and
 * OrgTemplatesService for template application.
 */
@Module({
  imports: [PrismaModule, AuthModule, OrgTemplatesModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
