import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { SsoConfigService } from './sso-config.service.js';
import { SsoController } from './sso.controller.js';
import { SsoService } from './sso.service.js';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [SsoController],
  providers: [SsoService, SsoConfigService],
  exports: [SsoService, SsoConfigService],
})
export class SsoModule {}
