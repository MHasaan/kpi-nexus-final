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
import { RolesService, type PublicRole } from './roles.service.js';
import { CreateRoleDtoSchema } from './dto/create-role.dto.js';
import { UpdateRoleDtoSchema } from './dto/update-role.dto.js';

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

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list(): Promise<PublicRole[]> {
    return this.roles.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PublicRole> {
    return this.roles.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.ROLES_MANAGE)
  create(@Body() body: unknown): Promise<PublicRole> {
    const dto = parse(CreateRoleDtoSchema, body);
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.ROLES_MANAGE)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicRole> {
    const dto = parse(UpdateRoleDtoSchema, body);
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ROLES_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.roles.remove(id);
  }
}
