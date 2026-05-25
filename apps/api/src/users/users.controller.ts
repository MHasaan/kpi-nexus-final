import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PermissionKey } from '@kpi-nexus/contracts';
import type { ZodTypeAny, infer as ZInfer } from 'zod';

import { OwnerOverride } from '../rbac/decorators/owner-override.decorator.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { InviteUserDtoSchema } from './dto/invite-user.dto.js';
import { UsersService, type InviteResult, type PublicUser } from './users.service.js';

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

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PermissionKey.USERS_VIEW)
  list(): Promise<PublicUser[]> {
    return this.users.list();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.USERS_VIEW)
  @OwnerOverride('id')
  getById(@Param('id') id: string): Promise<PublicUser> {
    return this.users.getById(id);
  }

  /** Invite a user. Creates an INVITED User + EmailVerificationToken. */
  @Post()
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  invite(@Body() body: unknown): Promise<InviteResult> {
    return this.users.invite(parse(InviteUserDtoSchema, body));
  }
}
