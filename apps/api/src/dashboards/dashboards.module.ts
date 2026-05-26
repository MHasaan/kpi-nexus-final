import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { DashboardsController } from './dashboards.controller.js';
import { DashboardsService } from './dashboards.service.js';
import { WidgetsService } from './widgets.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [DashboardsController],
  providers: [DashboardsService, WidgetsService],
  exports: [DashboardsService, WidgetsService],
})
export class DashboardsModule {}
