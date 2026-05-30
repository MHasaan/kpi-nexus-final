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
  AddMemberDtoSchema,
  CreateOrgUnitDtoSchema,
  UpdateOrgUnitDtoSchema,
} from './dto/create-org-unit.dto.js';
import {
  MergeUnitsDtoSchema,
  MoveUsersDtoSchema,
  RenameOrgUnitDtoSchema,
  SplitUnitDtoSchema,
} from './dto/reorganize.dto.js';
import { OrgUnitsService } from './org-units.service.js';

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

@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly orgUnits: OrgUnitsService) {}

  @Get()
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  list() {
    return this.orgUnits.list();
  }

  @Get(':id')
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  getById(@Param('id') id: string) {
    return this.orgUnits.getById(id);
  }

  @Post()
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  create(@Body() body: unknown) {
    return this.orgUnits.create(parse(CreateOrgUnitDtoSchema, body));
  }

  @Patch(':id')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.orgUnits.update(id, parse(UpdateOrgUnitDtoSchema, body));
  }

  @Delete(':id')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.orgUnits.remove(id);
  }

  // ---- Reorganization ----

  @Post('move-users')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  moveUsers(@Body() body: unknown): Promise<void> {
    return this.orgUnits.moveUsers(parse(MoveUsersDtoSchema, body));
  }

  @Get('by-user/:userId/memberships')
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  membershipsByUser(@Param('userId') userId: string) {
    return this.orgUnits.listMembershipsByUser(userId);
  }

  @Post(':id/rename')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  rename(@Param('id') id: string, @Body() body: unknown) {
    return this.orgUnits.renameUnit(id, parse(RenameOrgUnitDtoSchema, body).name);
  }

  @Get(':id/name-history')
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  nameHistory(@Param('id') id: string) {
    return this.orgUnits.getNameHistory(id);
  }

  @Post(':id/merge-into')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  mergeInto(@Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.orgUnits.mergeUnits(id, parse(MergeUnitsDtoSchema, body).targetId);
  }

  @Post(':id/split')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  split(@Param('id') id: string, @Body() body: unknown) {
    return this.orgUnits.splitUnit(id, parse(SplitUnitDtoSchema, body));
  }

  @Get(':id/members')
  @RequirePermissions(PermissionKey.GROUPS_VIEW)
  listMembers(@Param('id') id: string) {
    return this.orgUnits.listMembers(id);
  }

  @Post(':id/members')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  addMember(@Param('id') id: string, @Body() body: unknown) {
    return this.orgUnits.addMember(id, parse(AddMemberDtoSchema, body));
  }

  @Delete(':id/members/:userId')
  @RequirePermissions(PermissionKey.GROUPS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.orgUnits.removeMember(id, userId);
  }
}
