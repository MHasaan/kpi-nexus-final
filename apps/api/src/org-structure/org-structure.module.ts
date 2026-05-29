import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import {
  OrgUnitDimensionsController,
  OrgUnitTypesController,
} from './org-structure.controller.js';
import { OrgStructureService } from './org-structure.service.js';

/** OrgUnitDimensions + OrgUnitTypes CRUD (org-structure configuration). */
@Module({
  imports: [AuditModule, RbacModule],
  controllers: [OrgUnitDimensionsController, OrgUnitTypesController],
  providers: [OrgStructureService],
  exports: [OrgStructureService],
})
export class OrgStructureModule {}
