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
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import type { PublicKpi } from '../kpis/kpis.service.js';
import { KpiTemplatesService, type PublicKpiTemplate } from './kpi-templates.service.js';
import {
  CreateTemplateDtoSchema,
  InstantiateTemplateDtoSchema,
  ListTemplatesQuerySchema,
} from './dto/template.dto.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request',
      details: { issues: result.error.issues },
    });
  }
  return result.data;
};

@Controller('kpi-templates')
export class KpiTemplatesController {
  constructor(private readonly templates: KpiTemplatesService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(@Query() query: Record<string, unknown>): Promise<PublicKpiTemplate[]> {
    return this.templates.list(parse(ListTemplatesQuerySchema, query));
  }

  @Post(':id/instantiate')
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  instantiate(@Param('id') id: string, @Body() body: unknown): Promise<PublicKpi> {
    return this.templates.instantiate(id, parse(InstantiateTemplateDtoSchema, body ?? {}));
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicKpiTemplate> {
    return this.templates.create(parse(CreateTemplateDtoSchema, body));
  }
}
