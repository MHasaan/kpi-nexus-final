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
import {
  CreatePositionDtoSchema,
  UpdatePositionDtoSchema,
} from './dto/create-position.dto.js';
import { PositionsService, type PublicPosition } from './positions.service.js';

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

@Controller('positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  list(): Promise<PublicPosition[]> {
    return this.positions.list();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<PublicPosition> {
    return this.positions.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.POSITIONS_MANAGE)
  create(@Body() body: unknown): Promise<PublicPosition> {
    return this.positions.create(parse(CreatePositionDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.POSITIONS_MANAGE)
  update(@Param('id') id: string, @Body() body: unknown): Promise<PublicPosition> {
    return this.positions.update(id, parse(UpdatePositionDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.POSITIONS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.positions.remove(id);
  }
}
