import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { KpiTargetsModule } from '../kpi-targets/kpi-targets.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { RolesModule } from '../roles/roles.module.js';
import { ApprovalApplyService } from './approval-apply.service.js';
import { ApprovalGateModule } from './approval-gate.module.js';
import { ApprovalRequestService } from './approval-request.service.js';
import { ApprovalWorkflowService } from './approval-workflow.service.js';
import { ApprovalsController } from './approvals.controller.js';

/**
 * Approval workflows + requests. Imports the domain modules so the apply side
 * can replay approved mutations; the gate side (ApprovalGateModule) is a
 * separate, dependency-free module the domain modules import — no cycle.
 */
@Module({
  imports: [AuditModule, ApprovalGateModule, KpisModule, KpiTargetsModule, RolesModule],
  controllers: [ApprovalsController],
  providers: [ApprovalWorkflowService, ApprovalRequestService, ApprovalApplyService],
  exports: [ApprovalWorkflowService, ApprovalRequestService, ApprovalApplyService],
})
export class ApprovalsModule {}
