import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import { z } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { DataSnapshotsService } from './data-snapshots.service.js';

const TakeSnapshotDtoSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

/** KPI snapshots: freeze a KPI and the values you can read, for later reference. */
@Controller('kpis/:id/snapshots')
export class DataSnapshotsController {
  constructor(private readonly snapshots: DataSnapshotsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PermissionKey.KPI_EDIT)
  take(@Param('id') id: string, @Body() body: unknown) {
    const parsed = TakeSnapshotDtoSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request body', details: { issues: parsed.error.issues } });
    }
    return this.snapshots.takeKpiSnapshot(id, parsed.data.reason);
  }

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Param('id') id: string) {
    return this.snapshots.listKpiSnapshots(id);
  }

  @Get(':snapshotId')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  get(@Param('id') id: string, @Param('snapshotId') snapshotId: string) {
    return this.snapshots.getKpiSnapshot(id, snapshotId);
  }
}
