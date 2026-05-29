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
import { AlertRulesService, type PublicAlertRule } from './alert-rules.service.js';
import {
  CreateAlertRuleDtoSchema,
  UpdateAlertRuleDtoSchema,
} from './dto/alert-rule.dto.js';

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

@Controller('alert-rules')
export class AlertRulesController {
  constructor(private readonly alertRules: AlertRulesService) {}

  @Get()
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  list(@Query('kpiId') kpiId?: string): Promise<PublicAlertRule[]> {
    return this.alertRules.list(kpiId);
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.ALERTS_VIEW)
  getById(@Param('id') id: string): Promise<PublicAlertRule> {
    return this.alertRules.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicAlertRule> {
    return this.alertRules.create(parse(CreateAlertRuleDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicAlertRule> {
    return this.alertRules.update(id, parse(UpdateAlertRuleDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.alertRules.remove(id);
  }
}
