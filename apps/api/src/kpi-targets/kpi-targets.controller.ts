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
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { KpiTargetsService, type PublicKpiTarget } from './kpi-targets.service.js';
import {
  CreateKpiTargetDtoSchema,
  UpdateKpiTargetDtoSchema,
} from './kpi-target.validation.js';

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

@Controller('kpis/:kpiId/targets')
export class KpiTargetsController {
  constructor(private readonly targets: KpiTargetsService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Param('kpiId') kpiId: string): Promise<PublicKpiTarget[]> {
    return this.targets.list(kpiId);
  }

  @Get('active')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  active(@Param('kpiId') kpiId: string, @Query('at') at?: string): Promise<PublicKpiTarget | null> {
    return this.targets.resolveActive(kpiId, at ? new Date(at) : undefined);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.CREATED)
  create(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<PublicKpiTarget> {
    return this.targets.create(kpiId, parse(CreateKpiTargetDtoSchema, body));
  }

  @Patch(':targetId')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  update(@Param('targetId') targetId: string, @Body() body: unknown): Promise<PublicKpiTarget> {
    return this.targets.update(targetId, parse(UpdateKpiTargetDtoSchema, body));
  }

  @Delete(':targetId')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('targetId') targetId: string): Promise<void> {
    return this.targets.remove(targetId);
  }
}
