import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpiBenchmarksController } from './kpi-benchmarks.controller.js';
import { KpiBenchmarksService } from './kpi-benchmarks.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpiBenchmarksController],
  providers: [KpiBenchmarksService],
  exports: [KpiBenchmarksService],
})
export class KpiBenchmarksModule {}
