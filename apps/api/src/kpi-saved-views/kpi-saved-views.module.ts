import { Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module.js';
import { KpiSavedViewsController } from './kpi-saved-views.controller.js';
import { KpiSavedViewsService } from './kpi-saved-views.service.js';

@Module({
  imports: [RbacModule],
  controllers: [KpiSavedViewsController],
  providers: [KpiSavedViewsService],
})
export class KpiSavedViewsModule {}
