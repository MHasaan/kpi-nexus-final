import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { EmailModule } from '../email/email.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PublicEmbedController } from './public-embed.controller.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { ScheduledReportProcessor } from './scheduled-report.processor.js';
import { ScheduledReportService } from './scheduled-report.service.js';
import { ScheduledReportsController } from './scheduled-reports.controller.js';
import { BoardPackService } from './services/board-pack.service.js';
import { EmbedTokenService } from './services/embed-token.service.js';
import { StorageService } from './services/storage.service.js';

/**
 * P3.6/3.7 Reports module.
 * Provides:
 *   - ReportsService          — on-demand CSV/Excel/PDF generation
 *   - BoardPackService         — JSON board-pack composition
 *   - EmbedTokenService        — stateless HMAC embed tokens (exported for re-use)
 *   - StorageService           — MinIO/S3 upload + presigned URL
 *   - ScheduledReportService   — BullMQ repeatable job management
 *   - ScheduledReportProcessor — BullMQ worker (runs in API process)
 *
 * Imports KpisModule to access KpiDataService (dashboardSummary + listForKpi).
 * PrismaModule is global but listed explicitly for clarity.
 * EmailModule provides the nodemailer-backed EmailService.
 */
@Module({
  imports: [
    KpisModule,
    PrismaModule,
    EmailModule,
    BullModule.registerQueue({ name: 'scheduled-report' }),
  ],
  controllers: [ReportsController, PublicEmbedController, ScheduledReportsController],
  providers: [
    ReportsService,
    BoardPackService,
    EmbedTokenService,
    StorageService,
    ScheduledReportService,
    ScheduledReportProcessor,
  ],
  exports: [EmbedTokenService],
})
export class ReportsModule {}
