import { Module } from '@nestjs/common';

import { ApprovalGateModule } from '../approvals/approval-gate.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [ApprovalGateModule, AuditModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
