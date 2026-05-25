import { Module } from '@nestjs/common';

import { PermissionDelegationsController } from './permission-delegations.controller.js';
import { PermissionDelegationsService } from './permission-delegations.service.js';

@Module({
  controllers: [PermissionDelegationsController],
  providers: [PermissionDelegationsService],
  exports: [PermissionDelegationsService],
})
export class PermissionDelegationsModule {}
