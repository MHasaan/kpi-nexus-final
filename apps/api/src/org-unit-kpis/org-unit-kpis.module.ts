import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { OrgUnitKpisController } from './org-unit-kpis.controller.js';
import { OrgUnitKpisService } from './org-unit-kpis.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [OrgUnitKpisController],
  providers: [OrgUnitKpisService],
  exports: [OrgUnitKpisService],
})
export class OrgUnitKpisModule {}
