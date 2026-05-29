import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { DemoDataController } from './demo-data.controller.js';
import { DemoDataService } from './demo-data.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [DemoDataController],
  providers: [DemoDataService],
  exports: [DemoDataService],
})
export class DemoDataModule {}
