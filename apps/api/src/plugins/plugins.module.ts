import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { PluginsController } from './plugins.controller.js';
import { PluginsService } from './plugins.service.js';

@Module({
  imports: [AuditModule],
  controllers: [PluginsController],
  providers: [PluginsService],
  exports: [PluginsService],
})
export class PluginsModule {}
