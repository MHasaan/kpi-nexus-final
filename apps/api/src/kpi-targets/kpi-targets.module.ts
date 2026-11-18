import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ApprovalGateModule } from '../approvals/approval-gate.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { queueProcessors } from '../config/queue-workers.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiTargetSyncProcessor } from './kpi-target-sync.processor.js';
import { KPI_TARGET_SYNC_QUEUE, KpiTargetSyncProducer } from './kpi-target-sync.producer.js';
import { KpiTargetSyncService } from './kpi-target-sync.service.js';
import { KpiTargetsController } from './kpi-targets.controller.js';
import { KpiTargetsService } from './kpi-targets.service.js';

@Module({
  imports: [AuditModule, RbacModule, ApprovalGateModule, BullModule.registerQueue({ name: KPI_TARGET_SYNC_QUEUE })],
  controllers: [KpiTargetsController],
  providers: [KpiTargetsService, KpiTargetSyncService, KpiTargetSyncProducer, ...queueProcessors([KpiTargetSyncProcessor])],
  exports: [KpiTargetsService],
})
export class KpiTargetsModule {}
