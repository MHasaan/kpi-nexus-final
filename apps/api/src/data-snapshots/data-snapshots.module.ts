import { Module } from '@nestjs/common';

import { KpisModule } from '../kpis/kpis.module.js';
import { RbacModule } from '../rbac/rbac.module.js';
import { DataSnapshotsController } from './data-snapshots.controller.js';
import { DataSnapshotsService } from './data-snapshots.service.js';

@Module({
  imports: [KpisModule, RbacModule],
  controllers: [DataSnapshotsController],
  providers: [DataSnapshotsService],
})
export class DataSnapshotsModule {}
