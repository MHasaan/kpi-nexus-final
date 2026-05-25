import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { RecordDataPointDtoSchema } from './dto/record-data-point.dto.js';
import { KpiDataService, type PublicDataPoint } from './kpi-data.service.js';

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

/**
 * Scope-specific data endpoints (spec §6).
 *
 * Each endpoint enforces that the targeted KPI's scope matches the
 * endpoint's intent. Mismatches return HTTP 422 with the correct
 * endpoint name in the response body.
 */
@Controller()
export class KpiDataController {
  constructor(private readonly data: KpiDataService) {}

  /** ORG_WIDE only. POST /kpis/:id/data */
  @Post('kpis/:id/data')
  @RequirePermissions(PermissionKey.KPI_DATA_ENTRY)
  @HttpCode(HttpStatus.CREATED)
  recordOrgWide(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PublicDataPoint> {
    return this.data.recordForOrgWideKpi(id, parse(RecordDataPointDtoSchema, body));
  }

  /** PER_UNIT only. POST /org-units/kpi-assignments/:assignmentId/data */
  @Post('org-units/kpi-assignments/:assignmentId/data')
  @RequirePermissions(PermissionKey.KPI_DATA_ENTRY)
  @HttpCode(HttpStatus.CREATED)
  recordPerUnit(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
  ): Promise<PublicDataPoint> {
    return this.data.recordForOrgUnitAssignment(
      assignmentId,
      parse(RecordDataPointDtoSchema, body),
    );
  }

  /** PER_USER only (current user only). POST /user-kpis/my-kpis/:assignmentId/data */
  @Post('user-kpis/my-kpis/:assignmentId/data')
  @RequirePermissions(PermissionKey.KPI_DATA_ENTRY)
  @HttpCode(HttpStatus.CREATED)
  recordPerUser(
    @Param('assignmentId') assignmentId: string,
    @Body() body: unknown,
  ): Promise<PublicDataPoint> {
    return this.data.recordForMyUserAssignment(
      assignmentId,
      parse(RecordDataPointDtoSchema, body),
    );
  }

  /** GET /kpis/:id/data — visibility-filtered. */
  @Get('kpis/:id/data')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  listForKpi(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<PublicDataPoint[]> {
    return this.data.listForKpi(id, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  /**
   * GET /kpis/dashboard-summary — one row per visible KPI with the latest
   * value + aggregated value over the window. Visibility-filtered.
   */
  @Get('kpis/dashboard-summary')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  dashboardSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.data.dashboardSummary({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
