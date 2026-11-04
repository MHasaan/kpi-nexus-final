import { Module } from '@nestjs/common';

import { DashboardsModule } from '../dashboards/dashboards.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [RbacModule, DashboardsModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
