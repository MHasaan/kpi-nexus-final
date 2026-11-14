import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { CreateKpiSavedViewDtoSchema, UpdateKpiSavedViewDtoSchema } from './dto/kpi-saved-view.dto.js';
import { KpiSavedViewsService, type PublicKpiSavedView } from './kpi-saved-views.service.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request body', details: { issues: result.error.issues } });
  }
  return result.data;
};

/** Saved filter sets for the KPI list. Anyone who can view KPIs can keep their own. */
@Controller('kpi-saved-views')
@RequirePermissions(PermissionKey.KPI_VIEW)
export class KpiSavedViewsController {
  constructor(private readonly views: KpiSavedViewsService) {}

  @Get()
  list(): Promise<PublicKpiSavedView[]> {
    return this.views.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody(CreateKpiSavedViewDtoSchema)
  create(@Body() body: unknown): Promise<PublicKpiSavedView> {
    return this.views.create(parse(CreateKpiSavedViewDtoSchema, body));
  }

  @Patch(':id')
  @ApiBody(UpdateKpiSavedViewDtoSchema)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicKpiSavedView> {
    return this.views.update(id, parse(UpdateKpiSavedViewDtoSchema, body));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.views.remove(id);
  }
}
