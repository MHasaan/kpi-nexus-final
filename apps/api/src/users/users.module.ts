import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PermissionsGuard } from '../rbac/guards/permissions.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
