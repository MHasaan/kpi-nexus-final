import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { KeyResultsService } from './key-results.service.js';
import { ObjectivesService } from './objectives.service.js';
import { OkrsController } from './okrs.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [OkrsController],
  providers: [ObjectivesService, KeyResultsService],
  exports: [ObjectivesService, KeyResultsService],
})
export class OkrsModule {}
