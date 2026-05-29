import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module.js';
import { PlatformAdminController } from './platform-admin.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';
import { PlatformAdminService } from './platform-admin.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService, PlatformAdminGuard],
  exports: [PlatformAdminService],
})
export class PlatformAdminModule {}
