import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RetentionController } from './retention.controller.js';
import { queueProcessors } from '../config/queue-workers.js';
import { RetentionPurgeProcessor } from './retention-purge.processor.js';
import { RETENTION_PURGE_QUEUE, RetentionPurgeProducer } from './retention-purge.producer.js';
import { RetentionService } from './retention.service.js';

@Module({
  imports: [AuditModule, BullModule.registerQueue({ name: RETENTION_PURGE_QUEUE })],
  controllers: [RetentionController],
  providers: [RetentionService, RetentionPurgeProducer, ...queueProcessors([RetentionPurgeProcessor])],
  exports: [RetentionService],
})
export class RetentionModule {}
