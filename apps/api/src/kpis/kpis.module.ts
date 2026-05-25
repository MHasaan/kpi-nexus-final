import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { KpisController } from './kpis.controller.js';
import { KpisService } from './kpis.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [KpisController],
  providers: [KpisService],
  exports: [KpisService],
})
export class KpisModule {}
