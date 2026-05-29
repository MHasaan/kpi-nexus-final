import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiSuggestionsController } from './kpi-suggestions.controller.js';
import { KpiSuggestionsService } from './kpi-suggestions.service.js';

/**
 * KpiSuggestionsModule — AI-generated KPI suggestions for the create flow.
 * Imports AiModule for the router; one-way dependency (AiModule does not import
 * this), so no cycle.
 */
@Module({
  imports: [PrismaModule, RbacModule, AiModule],
  controllers: [KpiSuggestionsController],
  providers: [KpiSuggestionsService],
  exports: [KpiSuggestionsService],
})
export class KpiSuggestionsModule {}
