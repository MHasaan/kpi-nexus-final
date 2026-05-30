import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { SetupChecklistController } from './setup-checklist.controller.js';
import { SetupChecklistService } from './setup-checklist.service.js';

/**
 * SetupChecklistModule — the 14-task post-onboarding setup checklist shown on
 * the home page. Auth-only (no specific permission); lazily upserted.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SetupChecklistController],
  providers: [SetupChecklistService],
  exports: [SetupChecklistService],
})
export class SetupChecklistModule {}
