import { Module } from '@nestjs/common';

import { ApprovalGateService } from './approval-gate.service.js';

/**
 * Lightweight module exposing only the approval seam (ApprovalGateService).
 * Domain modules (KPIs, KPI targets, roles) import this without pulling in the
 * apply side, so there is no circular dependency with ApprovalsModule.
 */
@Module({
  providers: [ApprovalGateService],
  exports: [ApprovalGateService],
})
export class ApprovalGateModule {}
