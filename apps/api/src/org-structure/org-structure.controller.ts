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
import {
  OrgStructureService,
  type PublicDimension,
  type PublicType,
} from './org-structure.service.js';
import {
  CreateDimensionDtoSchema,
  CreateTypeDtoSchema,
  UpdateDimensionDtoSchema,
  UpdateTypeDtoSchema,
} from './dto/org-structure.dto.js';

const parse = <S extends ZodTypeAny>(schema: S, body: unknown): ZInfer<S> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid request body', details: { issues: result.error.issues } });
  }
  return result.data;
};

@Controller('org-unit-dimensions')
export class OrgUnitDimensionsController {
  constructor(private readonly svc: OrgStructureService) {}

  @Get()
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  list(): Promise<PublicDimension[]> {
    return this.svc.listDimensions();
  }

  @Post()
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicDimension> {
    return this.svc.createDimension(parse(CreateDimensionDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicDimension> {
    return this.svc.updateDimension(id, parse(UpdateDimensionDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.svc.deleteDimension(id);
  }
}

@Controller('org-unit-types')
export class OrgUnitTypesController {
  constructor(private readonly svc: OrgStructureService) {}

  @Get()
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  list(@Query('dimensionId') dimensionId?: string): Promise<PublicType[]> {
    return this.svc.listTypes(dimensionId);
  }

  @Post()
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown): Promise<PublicType> {
    return this.svc.createType(parse(CreateTypeDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicType> {
    return this.svc.updateType(id, parse(UpdateTypeDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.svc.deleteType(id);
  }
}
