import { Module } from '@nestjs/common';

import { queueProcessors } from '../config/queue-workers.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { KpiWatchQueueModule } from './kpi-watch-queue.module.js';
import { KpiWatchProcessor } from './kpi-watch.processor.js';
import { KpiWatchesController } from './kpi-watches.controller.js';
import { KpiWatchesService } from './kpi-watches.service.js';

@Module({
  imports: [RbacModule, RealtimeModule, KpiWatchQueueModule],
  controllers: [KpiWatchesController],
  providers: [KpiWatchesService, ...queueProcessors([KpiWatchProcessor])],
})
export class KpiWatchesModule {}
