import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { OrgUnitKpisService, type UnitKpiRow } from './org-unit-kpis.service.js';
import { AssignOrgUnitKpiDtoSchema } from './dto/org-unit-kpi.dto.js';

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

@Controller('org-units/:orgUnitId/kpis')
export class OrgUnitKpisController {
  constructor(private readonly orgUnitKpis: OrgUnitKpisService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Param('orgUnitId') orgUnitId: string): Promise<UnitKpiRow[]> {
    return this.orgUnitKpis.list(orgUnitId);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_CREATE, PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  assign(@Param('orgUnitId') orgUnitId: string, @Body() body: unknown): Promise<{ id: string }> {
    const dto = parse(AssignOrgUnitKpiDtoSchema, body);
    return this.orgUnitKpis.assign(orgUnitId, dto.kpiId, dto.targetValue);
  }

  @Post(':kpiId/override')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.OK)
  override(@Param('orgUnitId') orgUnitId: string, @Param('kpiId') kpiId: string): Promise<{ id: string }> {
    return this.orgUnitKpis.override(orgUnitId, kpiId);
  }

  @Delete(':kpiId')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  unassign(@Param('orgUnitId') orgUnitId: string, @Param('kpiId') kpiId: string): Promise<void> {
    return this.orgUnitKpis.unassign(orgUnitId, kpiId);
  }
}
