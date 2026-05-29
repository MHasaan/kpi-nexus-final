import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiFormulaController } from './kpi-formula.controller.js';
import { KpiFormulaService } from './kpi-formula.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpiFormulaController],
  providers: [KpiFormulaService],
  exports: [KpiFormulaService],
})
export class KpiFormulaModule {}
