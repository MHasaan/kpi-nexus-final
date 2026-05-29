import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PermissionsGuard } from '../rbac/guards/permissions.guard.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { OffboardingService } from './services/offboarding.service.js';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    OffboardingService,
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [UsersService, OffboardingService],
})
export class UsersModule {}
