import { Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module.js';
import { LineageController } from './lineage.controller.js';
import { LineageService } from './lineage.service.js';

@Module({
  imports: [RbacModule],
  controllers: [LineageController],
  providers: [LineageService],
  exports: [LineageService],
})
export class LineageModule {}
