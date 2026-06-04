import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { RequireResourceAccess } from '../rbac/decorators/require-resource-access.decorator.js';
import {
  DashboardsService,
  type PublicDashboard,
  buildDashboardEtag,
  parseIfMatch,
} from './dashboards.service.js';
import { type PublicSnapshotFull, type PublicSnapshotSummary, SnapshotService } from './snapshots.service.js';
import { type PublicShareLink, ShareLinksService } from './share-links.service.js';
import { type PublicWidget, WidgetsService } from './widgets.service.js';
import {
  AddWidgetDtoSchema,
  AssignDashboardUnitDtoSchema,
  CaptureSnapshotDtoSchema,
  CreateDashboardDtoSchema,
  CreateShareLinkDtoSchema,
  UpdateDashboardDtoSchema,
  UpdateWidgetDtoSchema,
  UpdateWidgetPositionDtoSchema,
} from './dto/dashboard.dto.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

@Controller('dashboards')
export class DashboardsController {
  constructor(
    private readonly dashboards: DashboardsService,
    private readonly widgets: WidgetsService,
    private readonly snapshots: SnapshotService,
    private readonly shareLinks: ShareLinksService,
  ) {}

  @Get()
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  list(): Promise<PublicDashboard[]> {
    return this.dashboards.list();
  }

  // Snapshots — static-segment routes declared before :id to avoid shadowing.

  @Get('snapshots/:snapshotId')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  getSnapshot(@Param('snapshotId') snapshotId: string): Promise<PublicSnapshotFull> {
    return this.snapshots.get(snapshotId);
  }

  @Delete('snapshots/:snapshotId')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSnapshot(@Param('snapshotId') snapshotId: string): Promise<void> {
    return this.snapshots.delete(snapshotId);
  }

  // Share links — static-segment routes declared before :id to avoid shadowing.

  @Delete('share/:linkId')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeShareLink(@Param('linkId') linkId: string): Promise<void> {
    return this.shareLinks.revoke(linkId);
  }

  // Archive endpoints — declare @Get('archived') BEFORE @Get(':id') so the
  // static segment is not captured as an id parameter.

  @Get('archived')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  listArchived(): Promise<PublicDashboard[]> {
    return this.dashboards.listArchived();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  @RequireResourceAccess('dashboard', 'id', 'view')
  async getById(@Param('id') id: string): Promise<PublicDashboard> {
    // Note: callers can also read the ETag from the response body's
    // `version` field; we surface the formatted ETag in the next PATCH
    // round-trip via the response header below.
    return this.dashboards.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicDashboard> {
    return this.dashboards.create(parse(CreateDashboardDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @RequireResourceAccess('dashboard', 'id', 'manage')
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch: string | undefined,
  ): Promise<PublicDashboard> {
    const expectedVersion = parseIfMatch(ifMatch);
    return this.dashboards.update(id, parse(UpdateDashboardDtoSchema, body), expectedVersion);
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @RequireResourceAccess('dashboard', 'id', 'manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.dashboards.remove(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  restore(@Param('id') id: string): Promise<PublicDashboard> {
    return this.dashboards.restore(id);
  }

  @Delete(':id/purge')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  purge(@Param('id') id: string): Promise<void> {
    return this.dashboards.purge(id);
  }

  @Post(':id/set-default')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  setDefault(@Param('id') id: string): Promise<PublicDashboard> {
    return this.dashboards.setDefault(id);
  }

  // Unit assignments (per-dashboard sub-resource, Phase 2.5) --------------------

  @Get(':id/unit-assignments')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  listUnitAssignments(@Param('id') id: string): Promise<Array<{ orgUnitId: string; createdAt: Date }>> {
    return this.dashboards.listUnitAssignments(id);
  }

  @Post(':id/unit-assignments')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  assignUnit(@Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.dashboards.assignUnit(id, parse(AssignDashboardUnitDtoSchema, body).orgUnitId);
  }

  @Delete(':id/unit-assignments/:orgUnitId')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassignUnit(@Param('id') id: string, @Param('orgUnitId') orgUnitId: string): Promise<void> {
    return this.dashboards.unassignUnit(id, orgUnitId);
  }

  // Share links (per-dashboard sub-resource) ---------------------------------

  @Get(':id/share')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  listShareLinks(@Param('id') dashboardId: string): Promise<PublicShareLink[]> {
    return this.shareLinks.list(dashboardId);
  }

  @Post(':id/share')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  createShareLink(
    @Param('id') dashboardId: string,
    @Body() body: unknown,
  ): Promise<PublicShareLink> {
    return this.shareLinks.create(dashboardId, parse(CreateShareLinkDtoSchema, body));
  }

  // Snapshots (per-dashboard sub-resource) -----------------------------------

  @Get(':id/snapshots')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  listSnapshots(@Param('id') dashboardId: string): Promise<PublicSnapshotSummary[]> {
    return this.snapshots.list(dashboardId);
  }

  @Post(':id/snapshots')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  captureSnapshot(
    @Param('id') dashboardId: string,
    @Body() body: unknown,
  ): Promise<PublicSnapshotFull> {
    return this.snapshots.capture(dashboardId, parse(CaptureSnapshotDtoSchema, body));
  }

  // Widgets ------------------------------------------------------------------

  @Get(':id/widgets')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  listWidgets(@Param('id') dashboardId: string): Promise<PublicWidget[]> {
    return this.widgets.list(dashboardId);
  }

  @Post(':id/widgets')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  addWidget(
    @Param('id') dashboardId: string,
    @Body() body: unknown,
  ): Promise<PublicWidget> {
    return this.widgets.add(dashboardId, parse(AddWidgetDtoSchema, body));
  }

  @Patch(':id/widgets/:wid')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  updateWidget(
    @Param('id') dashboardId: string,
    @Param('wid') widgetId: string,
    @Body() body: unknown,
  ): Promise<PublicWidget> {
    return this.widgets.update(dashboardId, widgetId, parse(UpdateWidgetDtoSchema, body));
  }

  @Post(':id/widgets/:wid/position')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  updateWidgetPosition(
    @Param('id') dashboardId: string,
    @Param('wid') widgetId: string,
    @Body() body: unknown,
  ): Promise<PublicWidget> {
    return this.widgets.updatePosition(
      dashboardId,
      widgetId,
      parse(UpdateWidgetPositionDtoSchema, body),
    );
  }

  @Delete(':id/widgets/:wid')
  @RequirePermissions(PermissionKey.DASHBOARD_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeWidget(
    @Param('id') dashboardId: string,
    @Param('wid') widgetId: string,
  ): Promise<void> {
    return this.widgets.remove(dashboardId, widgetId);
  }
}

// Re-export the ETag helper for tests + other modules.
export { buildDashboardEtag };
