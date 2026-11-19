import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { z, type ZodTypeAny, type infer as ZInfer } from 'zod';

import { ALL_PERMISSIONS, SUPPORTED_LOCALES, isTimeZone } from '@kpi-nexus/contracts';
import type { AccessProfile } from '@kpi-nexus/contracts';

import { Public } from '../rbac/decorators/public.decorator.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { PermissionResolverService } from '../rbac/services/permission-resolver.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService, type ClientInfo } from './auth.service.js';
import { AccountService, type SelfUser } from './services/account.service.js';
import { AcceptInvitationDtoSchema } from './dto/accept-invitation.dto.js';
import { InvitationPreviewDtoSchema } from './dto/invitation-preview.dto.js';
import { LoginDtoSchema, RefreshDtoSchema } from './dto/login.dto.js';
import { RegisterOrgDtoSchema } from './dto/register-org.dto.js';
import { ApiBody } from '../openapi/api-body.decorator.js';

const NotificationSettingsDtoSchema = z
  .object({
    digestMode: z.enum(['OFF', 'DAILY', 'WEEKLY']).optional(),
    muteStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    muteEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    mutedChannelKinds: z.array(z.string()).max(10).optional(),
  })
  .strict();

const UpdateProfileDtoSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    /** The person has seen the first-login tour; it is not shown to them again, on any device. */
    tourCompleted: z.literal(true).optional(),
    /** The language the app is shown in for this person, on every device. */
    language: z.enum(SUPPORTED_LOCALES).optional(),
    /** The timezone times are shown in for this person; null = the organisation's. */
    timezone: z.string().min(1).max(60).refine(isTimeZone, { message: 'timezone must be an IANA name such as Asia/Karachi' }).nullable().optional(),
  })
  .strict()
  .refine((dto) => dto.fullName !== undefined || dto.tourCompleted !== undefined || dto.language !== undefined || dto.timezone !== undefined, {
    message: 'Nothing to update',
  });

const ChangePasswordDtoSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(1).max(256),
  })
  .strict();

/** The parts of a request that say where it came from. */
interface ClientRequest {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/** Where a request came from, to write on the session it makes or renews. */
function clientOf(req: ClientRequest): ClientInfo {
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
}

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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly accessContext: AccessContextService,
    private readonly account: AccountService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiBody(RegisterOrgDtoSchema)
  register(@Body() body: unknown, @Req() req: ClientRequest) {
    const dto = parse(RegisterOrgDtoSchema, body);
    return this.auth.registerOrganization(dto, clientOf(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiBody(LoginDtoSchema)
  login(@Body() body: unknown, @Req() req: ClientRequest) {
    const dto = parse(LoginDtoSchema, body);
    return this.auth.login(dto, clientOf(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiBody(RefreshDtoSchema)
  refresh(@Body() body: unknown, @Req() req: ClientRequest) {
    const dto = parse(RefreshDtoSchema, body);
    return this.auth.refresh(dto.refreshToken, clientOf(req));
  }

  @Public()
  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  @ApiBody(AcceptInvitationDtoSchema)
  acceptInvitation(@Body() body: unknown, @Req() req: ClientRequest) {
    const dto = parse(AcceptInvitationDtoSchema, body);
    return this.auth.acceptInvitation(dto, clientOf(req));
  }

  @Public()
  @Post('invitation-preview')
  @HttpCode(HttpStatus.OK)
  @ApiBody(InvitationPreviewDtoSchema)
  invitationPreview(@Body() body: unknown) {
    const dto = parse(InvitationPreviewDtoSchema, body);
    return this.auth.previewInvitation(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody(RefreshDtoSchema)
  async logout(@Body() body: unknown): Promise<void> {
    const dto = parse(RefreshDtoSchema, body);
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  async me(): Promise<{
    user: {
      id: string;
      email: string;
      fullName: string;
      organizationId: string;
      roleId: string | null;
      mfaEnabled: boolean;
      status: string;
      notificationSettings: unknown;
      onboardingCompletedAt: Date | null;
      language: string | null;
      timezone: string | null;
      permissions: string[];
    };
    accessProfile: AccessProfile;
  }> {
    const ctx = RequestContextStore.require();
    const [user, resolved, accessProfile] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          organizationId: true,
          roleId: true,
          mfaEnabled: true,
          status: true,
          notificationSettings: true,
          onboardingCompletedAt: true,
          language: true,
          timezone: true,
        },
      }),
      this.permissionResolver.resolveForCurrentPrincipal(),
      this.accessContext.resolveForCurrentPrincipal(),
    ]);

    const permissions: string[] = resolved.isAdmin
      ? [...ALL_PERMISSIONS]
      : [...resolved.permissions];

    return { user: { ...user, permissions }, accessProfile };
  }

  /** Update the current user's notification preferences (digest, mute hours). */
  @Patch('me/notification-settings')
  @ApiBody(NotificationSettingsDtoSchema)
  async updateNotificationSettings(
    @Body() body: unknown,
  ): Promise<{ notificationSettings: unknown }> {
    const ctx = RequestContextStore.require();
    const dto = parse(NotificationSettingsDtoSchema, body);
    const updated = await this.prisma.user.update({
      where: { id: ctx.userId },
      data: { notificationSettings: dto },
      select: { notificationSettings: true },
    });
    return { notificationSettings: updated.notificationSettings };
  }

  /**
   * Update the current user's own profile. Self-service: authenticated-only,
   * no permission gate. Only `fullName` and the "tour seen" mark are mutable —
   * role/status/email are not.
   */
  @Patch('me')
  @ApiBody(UpdateProfileDtoSchema)
  async updateProfile(@Body() body: unknown): Promise<{ user: SelfUser }> {
    const dto = parse(UpdateProfileDtoSchema, body);
    const user = await this.account.updateProfile(dto);
    return { user };
  }

  /**
   * Change the current user's own password. Verifies the current password and
   * validates the new one against the org policy. Self-service: authenticated
   * only, operates on the current principal.
   */
  @Post('me/change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody(ChangePasswordDtoSchema)
  async changePassword(@Body() body: unknown): Promise<void> {
    const dto = parse(ChangePasswordDtoSchema, body);
    await this.account.changePassword(dto);
  }
}
