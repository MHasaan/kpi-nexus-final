import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiDataController } from './kpi-data.controller.js';
import { KpiDataService } from './kpi-data.service.js';
import { KpisController } from './kpis.controller.js';
import { KpisService } from './kpis.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpisController, KpiDataController],
  providers: [KpisService, KpiDataService],
  exports: [KpisService, KpiDataService],
})
export class KpisModule {}
