import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { InsightsController } from './insights.controller.js';
import { InsightsProcessor } from './insights.processor.js';
import { INSIGHTS_QUEUE, InsightsProducer } from './insights.producer.js';
import { InsightsService } from './insights.service.js';

/**
 * InsightsModule — AI trend narratives per KPI + a daily org-wide batch cron.
 * Imports AiModule (router + per-feature config); one-way, no cycle.
 */
@Module({
  imports: [PrismaModule, RbacModule, AiModule, BullModule.registerQueue({ name: INSIGHTS_QUEUE })],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsProducer, InsightsProcessor],
  exports: [InsightsService],
})
export class InsightsModule {}
