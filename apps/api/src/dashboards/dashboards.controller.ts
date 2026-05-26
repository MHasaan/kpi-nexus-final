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
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import {
  buildDashboardEtag,
  DashboardsService,
  parseIfMatch,
  type PublicDashboard,
} from './dashboards.service.js';
import { WidgetsService, type PublicWidget } from './widgets.service.js';
import {
  AddWidgetDtoSchema,
  CreateDashboardDtoSchema,
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
  ) {}

  @Get()
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  list(): Promise<PublicDashboard[]> {
    return this.dashboards.list();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
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
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.dashboards.remove(id);
  }

  @Post(':id/set-default')
  @RequirePermissions(PermissionKey.DASHBOARD_VIEW)
  setDefault(@Param('id') id: string): Promise<PublicDashboard> {
    return this.dashboards.setDefault(id);
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
