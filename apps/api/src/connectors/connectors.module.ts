import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { KpisModule } from '../kpis/kpis.module.js';
import { ConnectorsController } from './connectors.controller.js';
import { ConnectorsService } from './connectors.service.js';

@Module({
  imports: [AuditModule, KpisModule],
  controllers: [ConnectorsController],
  providers: [ConnectorsService],
  exports: [ConnectorsService],
})
export class ConnectorsModule {}
