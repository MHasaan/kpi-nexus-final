import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { CustomDomainsController } from './custom-domains.controller.js';
import { CustomDomainsService } from './custom-domains.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [CustomDomainsController],
  providers: [CustomDomainsService],
  exports: [CustomDomainsService],
})
export class CustomDomainsModule {}
