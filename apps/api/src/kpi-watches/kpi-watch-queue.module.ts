import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { KPI_WATCH_QUEUE, KpiWatchProducer } from './kpi-watch.producer.js';

/**
 * Shared anchor for the `kpi-watch` queue (like NlqReembedQueueModule): the
 * modules where watched events happen (KPIs, alert engine, analytics) import
 * this to enqueue, without importing KpiWatchesModule (which owns the processor).
 */
@Module({
  imports: [BullModule.registerQueue({ name: KPI_WATCH_QUEUE })],
  providers: [KpiWatchProducer],
  exports: [KpiWatchProducer],
})
export class KpiWatchQueueModule {}
