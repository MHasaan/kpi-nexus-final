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
import { CreatePermissionDelegationDtoSchema } from './dto/create-permission-delegation.dto.js';
import { PermissionDelegationsService } from './permission-delegations.service.js';

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

@Controller('permission-delegations')
export class PermissionDelegationsController {
  constructor(private readonly delegations: PermissionDelegationsService) {}

  @Get()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  list(
    @Query('involvingUserId') involvingUserId?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.delegations.list({
      involvingUserId,
      activeOnly: activeOnly === 'true',
    });
  }

  @Post()
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  create(@Body() body: unknown) {
    return this.delegations.create(parse(CreatePermissionDelegationDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.ORG_SETTINGS)
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@Param('id') id: string): Promise<void> {
    return this.delegations.revoke(id);
  }
}
