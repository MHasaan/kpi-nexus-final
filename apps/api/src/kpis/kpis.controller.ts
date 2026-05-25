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
import { CreateKpiDtoSchema, UpdateKpiDtoSchema } from './dto/create-kpi.dto.js';
import { KpisService, type PublicKpi } from './kpis.service.js';

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
  constructor(private readonly kpis: KpisService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(): Promise<PublicKpi[]> {
    return this.kpis.list();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  getById(@Param('id') id: string): Promise<PublicKpi> {
    return this.kpis.getById(id);
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
