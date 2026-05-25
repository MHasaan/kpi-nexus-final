import { Module } from '@nestjs/common';

import { ResourcePermissionsController } from './resource-permissions.controller.js';
import { ResourcePermissionsService } from './resource-permissions.service.js';

@Module({
  controllers: [ResourcePermissionsController],
  providers: [ResourcePermissionsService],
  exports: [ResourcePermissionsService],
})
export class ResourcePermissionsModule {}
