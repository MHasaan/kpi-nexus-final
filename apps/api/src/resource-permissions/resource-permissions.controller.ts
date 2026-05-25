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
  Query,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { CreateResourcePermissionDtoSchema } from './dto/create-resource-permission.dto.js';
import { ResourcePermissionsService } from './resource-permissions.service.js';

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

@Controller('resource-permissions')
export class ResourcePermissionsController {
  constructor(private readonly resourcePermissions: ResourcePermissionsService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(
    @Query('subjectType') subjectType?: 'user' | 'role',
    @Query('subjectId') subjectId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
  ) {
    return this.resourcePermissions.list({
      subjectType,
      subjectId,
      resourceType,
      resourceId,
    });
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  create(@Body() body: unknown) {
    return this.resourcePermissions.create(parse(CreateResourcePermissionDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.resourcePermissions.remove(id);
  }
}
