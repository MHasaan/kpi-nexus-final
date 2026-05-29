import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiCategoriesController } from './kpi-categories.controller.js';
import { KpiCategoriesService } from './kpi-categories.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpiCategoriesController],
  providers: [KpiCategoriesService],
  exports: [KpiCategoriesService],
})
export class KpiCategoriesModule {}
