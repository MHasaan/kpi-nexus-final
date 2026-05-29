import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { UserKpisController } from './user-kpis.controller.js';
import { UserKpisService } from './user-kpis.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [UserKpisController],
  providers: [UserKpisService],
  exports: [UserKpisService],
})
export class UserKpisModule {}
