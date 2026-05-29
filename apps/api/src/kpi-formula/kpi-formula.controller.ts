import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { KpiFormulaService, type PublicFormula } from './kpi-formula.service.js';
import { AttachFormulaDtoSchema } from './dto/formula.dto.js';

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

@Controller('kpis/:kpiId/formula')
export class KpiFormulaController {
  constructor(private readonly formula: KpiFormulaService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  get(@Param('kpiId') kpiId: string): Promise<PublicFormula | null> {
    return this.formula.get(kpiId);
  }

  @Put()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  attach(@Param('kpiId') kpiId: string, @Body() body: unknown): Promise<PublicFormula> {
    return this.formula.attach(kpiId, parse(AttachFormulaDtoSchema, body));
  }

  @Delete()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(@Param('kpiId') kpiId: string): Promise<void> {
    return this.formula.detach(kpiId);
  }
}
