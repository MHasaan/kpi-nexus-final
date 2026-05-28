import { Module } from '@nestjs/common';

import { KpisModule } from '../kpis/kpis.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PublicEmbedController } from './public-embed.controller.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { BoardPackService } from './services/board-pack.service.js';
import { EmbedTokenService } from './services/embed-token.service.js';

/**
 * P3.6 Reports module.
 * Provides:
 *   - ReportsService        — on-demand CSV/Excel/PDF generation
 *   - BoardPackService      — JSON board-pack composition
 *   - EmbedTokenService     — stateless HMAC embed tokens (exported for re-use)
 *
 * Imports KpisModule to access KpiDataService (dashboardSummary + listForKpi).
 * PrismaModule is global but listed explicitly for clarity.
 */
@Module({
  imports: [KpisModule, PrismaModule],
  controllers: [ReportsController, PublicEmbedController],
  providers: [ReportsService, BoardPackService, EmbedTokenService],
  exports: [EmbedTokenService],
})
export class ReportsModule {}
