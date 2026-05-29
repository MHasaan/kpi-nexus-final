import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { AlertEngineProcessor } from './alert-engine.processor.js';
import { AlertEngineProducer, ALERT_EVAL_QUEUE } from './alert-engine.producer.js';
import { AlertEngineService } from './alert-engine.service.js';

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
    BullModule.registerQueue({ name: ALERT_EVAL_QUEUE }),
  ],
  providers: [AlertEngineService, AlertEngineProducer, AlertEngineProcessor],
  exports: [AlertEngineProducer, AlertEngineService],
})
export class AlertEngineModule {}
