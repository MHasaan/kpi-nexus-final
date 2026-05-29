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
import {
  type CascadeTreeNode,
  KpiCascadesService,
  type PublicCascade,
} from './kpi-cascades.service.js';
import { AttachCascadeDtoSchema } from './dto/cascade.dto.js';

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

@Controller('kpi-cascades')
export class KpiCascadesController {
  constructor(private readonly cascades: KpiCascadesService) {}

  @Get()
  @RequirePermissions(PermissionKey.KPI_VIEW)
  list(): Promise<PublicCascade[]> {
    return this.cascades.list();
  }

  @Get('all')
  @RequirePermissions(PermissionKey.KPI_VIEW)
  tree(): Promise<CascadeTreeNode[]> {
    return this.cascades.tree();
  }

  @Post()
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.CREATED)
  attach(@Body() body: unknown): Promise<PublicCascade> {
    return this.cascades.attach(parse(AttachCascadeDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.KPI_EDIT)
  @HttpCode(HttpStatus.NO_CONTENT)
  detach(@Param('id') id: string): Promise<void> {
    return this.cascades.detach(id);
  }
}
