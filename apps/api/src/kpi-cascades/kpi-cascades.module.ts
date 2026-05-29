import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiCascadesController } from './kpi-cascades.controller.js';
import { KpiCascadesService } from './kpi-cascades.service.js';

@Module({
  imports: [AuditModule, RbacModule, KpisModule],
  controllers: [KpiCascadesController],
  providers: [KpiCascadesService],
  exports: [KpiCascadesService],
})
export class KpiCascadesModule {}
