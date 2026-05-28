import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
  CreateScheduledReportDtoSchema,
  UpdateScheduledReportDtoSchema,
} from './dto/reports.dto.js';
import { ScheduledReportService } from './scheduled-report.service.js';

const parse = <S extends ZodTypeAny>(schema: S, data: unknown): ZInfer<S> => {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

/**
 * P3.7 — Scheduled report endpoints.
 *
 *   GET    /scheduled-reports          — list (REPORTS_VIEW)
 *   POST   /scheduled-reports          — create (ORG_SETTINGS)
 *   GET    /scheduled-reports/:id      — get with recent runs (REPORTS_VIEW)
 *   PATCH  /scheduled-reports/:id      — update (ORG_SETTINGS)
 *   DELETE /scheduled-reports/:id      — remove (ORG_SETTINGS)
 *   POST   /scheduled-reports/:id/trigger — trigger one-off run (REPORTS_VIEW)
 */
@Controller('scheduled-reports')
export class ScheduledReportsController {
  constructor(private readonly scheduledReports: ScheduledReportService) {}

  @Get()
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  list() {
    return this.scheduledReports.list();
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown) {
    const dto = parse(CreateScheduledReportDtoSchema, body);
    return this.scheduledReports.create(dto);
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  get(@Param('id') id: string) {
    return this.scheduledReports.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = parse(UpdateScheduledReportDtoSchema, body);
    return this.scheduledReports.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.scheduledReports.remove(id);
  }

  @Post(':id/trigger')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(@Param('id') id: string): Promise<{ message: string }> {
    await this.scheduledReports.trigger(id);
    return { message: 'Report generation queued' };
  }
}
