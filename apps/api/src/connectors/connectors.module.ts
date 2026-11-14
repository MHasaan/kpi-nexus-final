import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { queueProcessors } from '../config/queue-workers.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { ConnectorRunProcessor } from './connector-run.processor.js';
import { CONNECTOR_RUN_QUEUE, ConnectorSchedulerService } from './connector-scheduler.service.js';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorsService } from './connectors.service.js';

@Module({
  imports: [AuditModule, KpisModule, BullModule.registerQueue({ name: CONNECTOR_RUN_QUEUE })],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorSchedulerService, ...queueProcessors([ConnectorRunProcessor])],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
