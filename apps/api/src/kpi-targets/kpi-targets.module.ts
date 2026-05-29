import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiTargetsController } from './kpi-targets.controller.js';
import { KpiTargetsService } from './kpi-targets.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpiTargetsController],
  providers: [KpiTargetsService],
  exports: [KpiTargetsService],
})
export class KpiTargetsModule {}
