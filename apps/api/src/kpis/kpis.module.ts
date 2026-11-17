import { Module } from '@nestjs/common';

import { AlertEngineModule } from '../alert-engine/alert-engine.module.js';
import { ApprovalGateModule } from '../approvals/approval-gate.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { CalculationEngineModule } from '../calculation-engine/calculation-engine.module.js';
import { KpiWatchQueueModule } from '../kpi-watches/kpi-watch-queue.module.js';
import { NlqReembedQueueModule } from '../nlq/nlq-reembed-queue.module.js';
import { OrgUnitKpisModule } from '../org-unit-kpis/org-unit-kpis.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { WorkflowsModule } from '../workflows/workflows.module.js';
import { CascadeService } from './cascade.service.js';
import { KpiAssignmentsService } from './kpi-assignments.service.js';
import { KpiDataController } from './kpi-data.controller.js';
import { KpiDataService } from './kpi-data.service.js';
import { KpiImportService } from './kpi-import.service.js';
import { KpisController } from './kpis.controller.js';
import { KpisService } from './kpis.service.js';

@Module({
  imports: [
    AuditModule,
    BillingModule,
    RbacModule,
    RealtimeModule,
    AlertEngineModule,
    CalculationEngineModule,
    ApprovalGateModule,
    WorkflowsModule,
    NlqReembedQueueModule, // provides ReembedProducer for KpisService trigger
    KpiWatchQueueModule, // provides KpiWatchProducer (data + status events)
    OrgUnitKpisModule, // provides OrgUnitKpisService so creating a PER_UNIT KPI cascades
  ],
  controllers: [KpisController, KpiDataController],
  providers: [KpisService, KpiDataService, CascadeService, KpiImportService, KpiAssignmentsService],
  exports: [KpisService, KpiDataService, CascadeService, KpiAssignmentsService],
})
export class KpisModule {}
