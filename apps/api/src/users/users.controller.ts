import { Controller, Get, Param } from '@nestjs/common';

import { PermissionKey } from '@kpi-nexus/contracts';

import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { UsersService, type PublicUser } from './users.service.js';

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
  getById(@Param('id') id: string): Promise<PublicUser> {
    return this.users.getById(id);
  }
}
