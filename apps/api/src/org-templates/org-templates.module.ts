import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { OrgTemplatesController } from './org-templates.controller.js';
import { OrgTemplatesService } from './org-templates.service.js';

/**
 * OrgTemplatesModule — builtin + org org-templates used during onboarding. The
 * rich SaaS-Startup template reproduces seed.ts depth. Exports the service so
 * OnboardingModule can apply a template into a draft.
 */
@Module({
  imports: [PrismaModule],
  controllers: [OrgTemplatesController],
  providers: [OrgTemplatesService],
  exports: [OrgTemplatesService],
})
export class OrgTemplatesModule {}
