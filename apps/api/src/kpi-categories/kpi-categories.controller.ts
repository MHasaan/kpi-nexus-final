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
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { KpiCategoriesService, type PublicKpiCategory } from './kpi-categories.service.js';
import {
  CreateKpiCategoryDtoSchema,
  UpdateKpiCategoryDtoSchema,
} from './dto/kpi-category.dto.js';

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

@Controller('kpi-categories')
export class KpiCategoriesController {
  constructor(private readonly categories: KpiCategoriesService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(): Promise<PublicKpiCategory[]> {
    return this.categories.list();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  getById(@Param('id') id: string): Promise<PublicKpiCategory> {
    return this.categories.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_CREATE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicKpiCategory> {
    return this.categories.create(parse(CreateKpiCategoryDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicKpiCategory> {
    return this.categories.update(id, parse(UpdateKpiCategoryDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.categories.remove(id);
  }
}
