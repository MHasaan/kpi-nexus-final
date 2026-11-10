import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AlertEngineModule } from './alert-engine/alert-engine.module.js';
import { CalculationEngineModule } from './calculation-engine/calculation-engine.module.js';
import { bullConnectionFromUrl } from './config/redis-connection.js';
import { EscalationsModule } from './escalations/escalations.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { NlqModule } from './nlq/nlq.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OnboardingModule } from './onboarding/onboarding.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

/**
 * WorkerModule — the queue worker process (OT-003, `dist/worker.js`).
 *
 * Shared infrastructure plus the modules that own a BullMQ processor; no HTTP
 * server. Those modules' controllers are instantiated but never routed. The
 * API runs the same processors itself unless RUN_QUEUE_WORKERS=false (see
 * config/queue-workers.ts).
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:HH:MM:ss.l',
                  ignore: 'pid,hostname',
                },
              },
      },
    }),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: bullConnectionFromUrl(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'),
      }),
    }),
    PrismaModule,
    AlertEngineModule,
    CalculationEngineModule,
    EscalationsModule,
    InsightsModule,
    NlqModule,
    NotificationsModule,
    OnboardingModule,
    ReportsModule,
    WebhooksModule,
  ],
})
export class WorkerModule {}
