import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsService } from './recommendations.service.js';

/**
 * RecommendationsModule — AI recommendations for KPIs, triggered manually or
 * auto-generated from alerts/anomalies. Exports RecommendationsService so the
 * AlertEngineModule can fire generateInOrg after raising an alert (one-way:
 * RecommendationsModule does not import AlertEngineModule, so no cycle).
 */
@Module({
  imports: [PrismaModule, RbacModule, AiModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
