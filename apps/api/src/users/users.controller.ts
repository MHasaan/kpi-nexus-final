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
  Put,
} from '@nestjs/common';
import { PermissionKey, UserAccessOverrideSchema } from '@kpi-nexus/contracts';
import type { AccessProfile } from '@kpi-nexus/contracts';
import type { infer as ZInfer, ZodTypeAny } from 'zod';

import { OwnerOverride } from '../rbac/decorators/owner-override.decorator.js';
import { RequirePermissions } from '../rbac/decorators/require-permissions.decorator.js';
import { InviteUserDtoSchema } from './dto/invite-user.dto.js';
import { OffboardDtoSchema } from './dto/offboard.dto.js';
import {
  type InviteResult,
  type PublicAccessOverride,
  type PublicUser,
  UsersService,
} from './users.service.js';
import { type OffboardSummary, OffboardingService } from './services/offboarding.service.js';

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
  constructor(
    private readonly users: UsersService,
    private readonly offboarding: OffboardingService,
  ) {}

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

  // -------------------------------------------------------------------------
  // Access Center (Phase 5/6) — USERS_MANAGE only.
  // -------------------------------------------------------------------------

  /** Resolved "what can this user see?" — the target user's effective AccessProfile. */
  @Get(':id/access-profile')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  getAccessProfile(@Param('id') id: string): Promise<AccessProfile> {
    return this.users.getAccessProfile(id);
  }

  @Get(':id/access-override')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  getAccessOverride(@Param('id') id: string): Promise<PublicAccessOverride | null> {
    return this.users.getAccessOverride(id);
  }

  @Put(':id/access-override')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  upsertAccessOverride(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PublicAccessOverride> {
    return this.users.upsertAccessOverride(id, parse(UserAccessOverrideSchema, body));
  }

  @Delete(':id/access-override')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccessOverride(@Param('id') id: string): Promise<void> {
    return this.users.deleteAccessOverride(id);
  }

  /** Invite a user. Creates an INVITED User + EmailVerificationToken. */
  @Post()
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  invite(@Body() body: unknown): Promise<InviteResult> {
    return this.users.invite(parse(InviteUserDtoSchema, body));
  }

  /** Offboard a user: transfer KPIs, reparent reports, vacate units, optionally archive. */
  @Post(':id/offboard')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  offboard(@Param('id') id: string, @Body() body: unknown): Promise<OffboardSummary> {
    return this.offboarding.offboard(id, parse(OffboardDtoSchema, body ?? {}));
  }

  /** Suspend a user: block sign-in (reversible). Refuses self + archived/deleted/purged. */
  @Post(':id/suspend')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  suspend(@Param('id') id: string): Promise<PublicUser> {
    return this.users.suspend(id);
  }

  /** Reactivate a SUSPENDED user back to ACTIVE. */
  @Post(':id/reactivate')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  reactivate(@Param('id') id: string): Promise<PublicUser> {
    return this.users.reactivate(id);
  }

  /** GDPR hard-purge a previously-ARCHIVED user (PII redaction). */
  @Post(':id/purge')
  @RequirePermissions(PermissionKey.USERS_MANAGE)
  @HttpCode(HttpStatus.OK)
  purge(@Param('id') id: string): Promise<{ handle: string }> {
    return this.users.purge(id);
  }
}
