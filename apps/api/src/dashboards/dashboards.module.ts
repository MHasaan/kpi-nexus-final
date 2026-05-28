import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { DashboardsController } from './dashboards.controller.js';
import { DashboardsService } from './dashboards.service.js';
import { PublicDashboardsController } from './public-dashboards.controller.js';
import { ShareLinksService } from './share-links.service.js';
import { SnapshotService } from './snapshots.service.js';
import { WidgetsService } from './widgets.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [DashboardsController, PublicDashboardsController],
  providers: [DashboardsService, WidgetsService, SnapshotService, ShareLinksService],
  exports: [DashboardsService, WidgetsService, SnapshotService, ShareLinksService],
})
export class DashboardsModule {}
