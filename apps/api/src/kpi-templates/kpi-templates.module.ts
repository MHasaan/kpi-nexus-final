import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiTemplatesController } from './kpi-templates.controller.js';
import { KpiTemplatesService } from './kpi-templates.service.js';

@Module({
  imports: [AuditModule, RbacModule, KpisModule],
  controllers: [KpiTemplatesController],
  providers: [KpiTemplatesService],
  exports: [KpiTemplatesService],
})
export class KpiTemplatesModule {}
