import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { AlertRulesController } from './alert-rules.controller.js';
import { AlertRulesService } from './alert-rules.service.js';

@Module({
  imports: [AuditModule, RbacModule],
  controllers: [AlertRulesController],
  providers: [AlertRulesService],
  exports: [AlertRulesService],
})
export class AlertRulesModule {}
