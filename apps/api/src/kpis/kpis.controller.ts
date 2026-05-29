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
import { z, type ZodTypeAny, type infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { CreateKpiDtoSchema, UpdateKpiDtoSchema } from './dto/create-kpi.dto.js';
import { KpisService, type PublicKpi } from './kpis.service.js';
import { KpiImportService } from './kpi-import.service.js';
import type { DryRunResult } from './kpi-import.js';

const ImportCsvDtoSchema = z.object({ csv: z.string().min(1).max(1_000_000) }).strict();

const TransitionDtoSchema = z
  .object({
    to: z.enum(['DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'PAUSED', 'DEPRECATED', 'ARCHIVED']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

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

@Controller('kpis')
export class KpisController {
  constructor(
    private readonly kpis: KpisService,
    private readonly importer: KpiImportService,
  ) {}

  @Post('import/dry-run')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.OK)
  importDryRun(@Body() body: unknown): Promise<DryRunResult> {
    return this.importer.dryRun(parse(ImportCsvDtoSchema, body).csv);
  }

  @Post('import/commit')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  importCommit(@Body() body: unknown): Promise<{ createdCount: number; createdIds: string[] }> {
    return this.importer.commit(parse(ImportCsvDtoSchema, body).csv);
  }

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(): Promise<PublicKpi[]> {
    return this.kpis.list();
  }

  @Get('archived')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  listArchived(): Promise<PublicKpi[]> {
    return this.kpis.listArchived();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  getById(@Param('id') id: string): Promise<PublicKpi> {
    return this.kpis.getById(id);
  }

  @Post(':id/restore')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  restore(@Param('id') id: string): Promise<PublicKpi> {
    return this.kpis.restore(id);
  }

  @Delete(':id/purge')
  @RequirePermissions(PermissionKey.KPI_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  purge(@Param('id') id: string): Promise<void> {
    return this.kpis.purge(id);
  }

  @Get(':id/versions')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  versions(@Param('id') id: string) {
    return this.kpis.listVersions(id);
  }

  @Post(':id/transition')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  transition(@Param('id') id: string, @Body() body: unknown): Promise<PublicKpi> {
    const dto = parse(TransitionDtoSchema, body);
    return this.kpis.transitionStatus(id, dto.to, dto.reason);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicKpi> {
    return this.kpis.create(parse(CreateKpiDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicKpi> {
    return this.kpis.update(id, parse(UpdateKpiDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.kpis.remove(id);
  }
}
