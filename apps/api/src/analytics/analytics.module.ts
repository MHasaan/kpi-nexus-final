import { Module } from '@nestjs/common';

import { KpisModule } from '../kpis/kpis.module.js';
import { MlModule } from '../ml/ml.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RecommendationsModule } from '../recommendations/recommendations.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnomalyService } from './anomaly.service.js';
import { ForecastsService } from './forecasts.service.js';
import { WhatIfService } from './whatif.service.js';

/**
 * AnalyticsModule — ML-backed KPI analytics (anomaly detection, forecasting,
 * what-if), all routed through the HMAC-signed MlModule client and gated by KPI
 * visibility (KpisService.getById). Anomaly confirm reuses RecommendationsService.
 */
@Module({
  imports: [PrismaModule, RbacModule, MlModule, KpisModule, RecommendationsModule],
  controllers: [AnalyticsController],
  providers: [AnomalyService, ForecastsService, WhatIfService],
  exports: [AnomalyService, ForecastsService, WhatIfService],
})
export class AnalyticsModule {}
