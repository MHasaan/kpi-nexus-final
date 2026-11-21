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
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import {
  CreateScheduledReportDtoSchema,
  UpdateScheduledReportDtoSchema,
} from './dto/reports.dto.js';
import { ScheduledReportService } from './scheduled-report.service.js';
import { ReportDownloadService } from './report-download.service.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

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
  constructor(
    private readonly scheduledReports: ScheduledReportService,
    private readonly downloads: ReportDownloadService,
  ) {}

  @Get()
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  list() {
    return this.scheduledReports.list();
  }

  @Post()
  @RequirePermissions(PermissionKey.REPORTS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @ApiBody(CreateScheduledReportDtoSchema)
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
  @RequirePermissions(PermissionKey.REPORTS_MANAGE)
  @ApiBody(UpdateScheduledReportDtoSchema)
  update(@Param('id') id: string, @Body() body: unknown) {
    const dto = parse(UpdateScheduledReportDtoSchema, body);
    return this.scheduledReports.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.REPORTS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.scheduledReports.remove(id);
  }

  /** A download address for one finished run, signed now and good for a few minutes. */
  @Get(':id/runs/:runId/download')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  download(@Param('id') id: string, @Param('runId') runId: string): Promise<{ url: string }> {
    return this.downloads.freshUrl(id, runId);
  }

  /** The file itself, through the API: a storage address is private in production (F-044). */
  @Get(':id/runs/:runId/file')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  async file(@Param('id') id: string, @Param('runId') runId: string, @Res() reply: FastifyReply): Promise<void> {
    const { stream, contentType, filename } = await this.downloads.file(id, runId);
    await reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `attachment; filename="${filename.replace(/"/g, "'")}"`)
      .send(stream);
  }

  @Post(':id/trigger')
  @RequirePermissions(PermissionKey.REPORTS_VIEW)
  @HttpCode(HttpStatus.ACCEPTED)
  async trigger(@Param('id') id: string): Promise<{ message: string }> {
    await this.scheduledReports.trigger(id);
    return { message: 'Report generation queued' };
  }
}
