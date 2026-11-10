import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { RecommendationsModule } from '../recommendations/recommendations.module.js';
import { EscalationsModule } from '../escalations/escalations.module.js';
import { AlertEngineProcessor } from './alert-engine.processor.js';
import { ALERT_EVAL_QUEUE, AlertEngineProducer } from './alert-engine.producer.js';
import { AlertEngineService } from './alert-engine.service.js';
import { queueProcessors } from '../config/queue-workers.js';

/**
 * AlertEngineModule — evaluates KPIs after data-point inserts (STATIC_THRESHOLD)
 * and on a NO_DATA cron scan, raising Alerts + publishing realtime events.
 *
 * Exports AlertEngineProducer so KpisModule can enqueue evaluations without a
 * circular dependency (KpisModule → AlertEngineModule one-way).
 */
@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    EscalationsModule,
    RecommendationsModule,
    BullModule.registerQueue({ name: ALERT_EVAL_QUEUE }),
  ],
  providers: [AlertEngineService, AlertEngineProducer, ...queueProcessors([AlertEngineProcessor])],
  exports: [AlertEngineProducer, AlertEngineService],
})
export class AlertEngineModule {}
