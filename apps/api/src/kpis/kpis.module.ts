import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { CascadeService } from './cascade.service.js';
import { KpiDataController } from './kpi-data.controller.js';
import { KpiDataService } from './kpi-data.service.js';
import { KpisController } from './kpis.controller.js';
import { KpisService } from './kpis.service.js';

@Module({
  imports: [AuditModule, RbacModule, RealtimeModule],
  controllers: [KpisController, KpiDataController],
  providers: [KpisService, KpiDataService, CascadeService],
  exports: [KpisService, KpiDataService, CascadeService],
})
export class KpisModule {}
