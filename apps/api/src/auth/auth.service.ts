import { createHash } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { describePasswordPolicy, passwordExpired, resolvePasswordPolicy } from '../password/password-policy.js';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { verifyTotp } from '../mfa/totp.js';
import { DEFAULT_ROLES } from './services/default-roles.js';
import { RefreshTokenService } from './services/refresh-token.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { JwtPayload } from './jwt.strategy.js';
import type { RegisterOrgDto } from './dto/register-org.dto.js';
import type { LoginDto } from './dto/login.dto.js';

export interface AuthPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  roleId: string | null;
}

export interface PublicOrganization {
  id: string;
  name: string;
  slug: string;
}

export type RegisterResponse = AuthPair & { user: PublicUser; organization: PublicOrganization };
export type LoginResponse = AuthPair & { user: PublicUser };

export interface InvitationPreview {
  email: string;
  organizationName: string;
  expiresAt: string | null;
  /** What the organisation's password policy asks for, in words. */
  passwordRules: string[];
}

/** Where a request came from: its address and the browser (or program) that sent it. */
export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

/** How a session was started, for the audit log's LOGIN row. */
type SignInHow = 'password' | 'password and code' | 'registration' | 'invitation' | 'setup';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly bcryptRounds = 12;
  private readonly accessTtlSeconds = 15 * 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly audit: AuditService,
  ) {}

  async registerOrganization(
    dto: RegisterOrgDto,
    client: ClientInfo = {},
  ): Promise<AuthPair & { user: PublicUser; organization: PublicOrganization }> {
    return RequestContextStore.runWithBypass('registerOrganization', async () => {
      const slugTaken = await this.prisma.organization.findUnique({
        where: { slug: dto.slug },
      });
      if (slugTaken) {
        throw new ConflictException({ code: 'CONFLICT', message: 'slug already in use' });
      }

      const passwordHash = await bcrypt.hash(dto.adminPassword, this.bcryptRounds);

      const { organization, adminUser, adminRole } = await this.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name: dto.orgName, slug: dto.slug },
        });

        await tx.roleDefinition.createMany({
          data: DEFAULT_ROLES.map((r) => ({
            organizationId: organization.id,
            name: r.name,
            description: r.description,
            permissions: r.permissions as unknown as string[],
            isAdmin: r.isAdmin,
            level: r.level,
            color: r.color,
          })),
        });

        const adminRole = await tx.roleDefinition.findUniqueOrThrow({
          where: { organizationId_name: { organizationId: organization.id, name: 'Admin' } },
        });

        const adminUser = await tx.user.create({
          data: {
            organizationId: organization.id,
            email: dto.adminEmail,
            fullName: dto.adminFullName,
            passwordHash,
            passwordChangedAt: new Date(),
            roleId: adminRole.id,
            emailVerifiedAt: new Date(),
            status: 'ACTIVE',
          },
        });

        // Seed a default org-structure axis + type so the OrgUnitsModule
        // can start creating units immediately. Admins can rename/extend
        // these via the org-structure UI later.
        const defaultDimension = await tx.orgUnitDimension.create({
          data: {
            organizationId: organization.id,
            name: 'Departments',
            isDefault: true,
          },
        });
        await tx.orgUnitType.create({
          data: {
            organizationId: organization.id,
            dimensionId: defaultDimension.id,
            name: 'Department',
            namePlural: 'Departments',
            allowNesting: true,
          },
        });

        return { organization, adminUser, adminRole };
      });

      const pair = await this.issuePair(
        {
          sub: adminUser.id,
          org: organization.id,
          rid: adminRole.id,
          adm: true,
        },
        client,
        'registration',
      );

      return {
        ...pair,
        user: this.publicUser(adminUser),
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
      };
    });
  }

  async login(
    dto: LoginDto,
    client: ClientInfo = {},
  ): Promise<AuthPair & { user: PublicUser }> {
    return RequestContextStore.runWithBypass('login', async () => {
      // Find user (within org if specified, else first ACTIVE match across orgs).
      const where = dto.organizationId
        ? { organizationId_email: { organizationId: dto.organizationId, email: dto.email } }
        : undefined;

      let user = where ? await this.prisma.user.findUnique({ where }) : null;
      if (!user) {
        // Multi-org fallback — find ACTIVE user by email
        user = await this.prisma.user.findFirst({
          where: { email: dto.email, status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
        });
      }

      const recordAttempt = (
        status:
          | 'SUCCESS'
          | 'INVALID_CREDENTIALS'
          | 'USER_NOT_FOUND'
          | 'USER_INACTIVE'
          | 'MFA_REQUIRED'
          | 'MFA_FAILED',
        reason?: string,
      ): Promise<unknown> =>
        this.prisma.loginAttempt.create({
          data: {
            email: dto.email,
            organizationId: user?.organizationId,
            userId: user?.id,
            status,
            reason,
            ipAddress: client.ip,
            userAgent: client.userAgent?.slice(0, 500),
          },
        });

      if (!user) {
        await recordAttempt('USER_NOT_FOUND');
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials' });
      }
      if (user.status !== 'ACTIVE') {
        await recordAttempt('USER_INACTIVE', `status=${user.status}`);
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Account is not active' });
      }
      if (!user.passwordHash) {
        await recordAttempt('INVALID_CREDENTIALS', 'sso_only_user');
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials' });
      }
      const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordOk) {
        await recordAttempt('INVALID_CREDENTIALS');
        throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials' });
      }

      // MFA gate: if user enrolled, code must be supplied and verify.
      if (user.mfaEnabled && user.mfaSecret) {
        if (!dto.mfaCode) {
          await recordAttempt('MFA_REQUIRED');
          throw new UnauthorizedException({
            code: 'MFA_REQUIRED',
            message: 'MFA code required',
          });
        }
        const mfaOk = await this.verifyMfaForLogin(user.id, dto.mfaCode, user.mfaSecret, user.mfaRecoveryHashes);
        if (!mfaOk) {
          await recordAttempt('MFA_FAILED');
          throw new UnauthorizedException({
            code: 'UNAUTHENTICATED',
            message: 'Invalid MFA code',
          });
        }
      }

      // The organisation's maximum password age. Checked last, so only someone who
      // knows the password (and passed MFA) learns that it has expired.
      const org = await this.prisma.organization.findUnique({
        where: { id: user.organizationId },
        select: { passwordPolicy: true },
      });
      if (passwordExpired(resolvePasswordPolicy(org?.passwordPolicy), user.passwordChangedAt)) {
        await recordAttempt('INVALID_CREDENTIALS', 'password_expired');
        throw new UnauthorizedException({
          code: 'PASSWORD_EXPIRED',
          message: 'Your password has expired. Reset it to sign in.',
        });
      }

      const isAdmin = user.roleId
        ? Boolean(
            (
              await this.prisma.roleDefinition.findUnique({
                where: { id: user.roleId },
                select: { isAdmin: true },
              })
            )?.isAdmin,
          )
        : false;

      await recordAttempt('SUCCESS');

      const pair = await this.issuePair(
        {
          sub: user.id,
          org: user.organizationId,
          rid: user.roleId,
          adm: isAdmin,
        },
        client,
        user.mfaEnabled ? 'password and code' : 'password',
      );

      return { ...pair, user: this.publicUser(user) };
    });
  }

  /**
   * Accept an invitation — verifies the EmailVerificationToken, applies the
   * org's password policy, flips the user to ACTIVE, sets emailVerifiedAt,
   * consumes the token, and issues a fresh auth pair. Returns the same
   * shape as login.
   */
  async acceptInvitation(
    args: {
      token: string;
      password: string;
    },
    client: ClientInfo = {},
  ): Promise<AuthPair & { user: PublicUser }> {
    return RequestContextStore.runWithBypass('acceptInvitation', async () => {
      const hashedToken = createHash('sha256').update(args.token).digest('hex');
      const record = await this.prisma.emailVerificationToken.findUnique({
        where: { hashedToken },
      });
      if (!record) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Invalid or expired invitation token',
        });
      }
      if (record.consumedAt !== null) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Invitation already accepted',
        });
      }
      if (record.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Invitation expired',
        });
      }

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: record.userId },
        include: { organization: { select: { passwordPolicy: true } } },
      });
      if (user.status === 'ACTIVE' && user.passwordHash !== null) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'User is already active',
        });
      }
      // An invitation withdrawn by archiving or suspending the person is dead,
      // even though its token has not expired (BE-046). Same answer as a bad token.
      if (isWithdrawnInvitee(user.status)) {
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Invalid or expired invitation token',
        });
      }

      // Apply per-org password policy
      const { checkPasswordPolicy, resolvePasswordPolicy } = await import(
        '../password/password-policy.js'
      );
      const policy = resolvePasswordPolicy(user.organization.passwordPolicy);
      const violations = checkPasswordPolicy(args.password, policy);
      if (violations.length > 0) {
        const { BadRequestException } = await import('@nestjs/common');
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Password does not meet policy',
          details: { violations },
        });
      }

      const passwordHash = await bcrypt.hash(args.password, this.bcryptRounds);

      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            passwordChangedAt: new Date(),
            status: 'ACTIVE',
            emailVerifiedAt: new Date(),
          },
        }),
        this.prisma.emailVerificationToken.update({
          where: { id: record.id },
          data: { consumedAt: new Date() },
        }),
      ]);

      const isAdmin = user.roleId
        ? Boolean(
            (
              await this.prisma.roleDefinition.findUnique({
                where: { id: user.roleId },
                select: { isAdmin: true },
              })
            )?.isAdmin,
          )
        : false;

      const pair = await this.issuePair(
        {
          sub: user.id,
          org: user.organizationId,
          rid: user.roleId,
          adm: isAdmin,
        },
        client,
        'invitation',
      );

      return { ...pair, user: this.publicUser(user) };
    });
  }

  /**
   * Preview an invitation before accepting — resolves the (hashed) invitation
   * token to its pending user + organization and returns only the invitee
   * email, the org name, and the token expiry. Any invalid / consumed / expired
   * / already-active token surfaces as a generic NotFoundException so callers
   * cannot probe which tokens exist. Returns nothing sensitive.
   */
  async previewInvitation(args: { token: string }): Promise<InvitationPreview> {
    return RequestContextStore.runWithBypass('previewInvitation', async () => {
      const notFound = new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Invitation not found',
      });

      const hashedToken = createHash('sha256').update(args.token).digest('hex');
      const record = await this.prisma.emailVerificationToken.findUnique({
        where: { hashedToken },
      });
      if (!record || record.consumedAt !== null || record.expiresAt.getTime() < Date.now()) {
        throw notFound;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: record.userId },
        select: {
          email: true,
          passwordHash: true,
          status: true,
          organization: { select: { name: true, passwordPolicy: true } },
        },
      });
      // Token already consumed via an accepted invitation manifests as an
      // active user with a password set — treat as not found.
      if (!user || (user.status === 'ACTIVE' && user.passwordHash !== null)) {
        throw notFound;
      }
      // A withdrawn invitation cannot be accepted (BE-046), so do not present it as live.
      if (isWithdrawnInvitee(user.status)) throw notFound;

      return {
        email: user.email,
        organizationName: user.organization.name,
        expiresAt: record.expiresAt.toISOString(),
        passwordRules: describePasswordPolicy(resolvePasswordPolicy(user.organization.passwordPolicy)),
      };
    });
  }

  async refresh(refreshToken: string, client: ClientInfo = {}): Promise<AuthPair> {
    // Public route: the caller is known only by the refresh token, so the token
    // rotation and these lookups are cross-tenant by nature — run them under the
    // RLS bypass, like login (OT-014).
    const { next, user, isAdmin } = await RequestContextStore.runWithBypass('refresh', async () => {
      const next = await this.refreshTokens.rotate(refreshToken, client);
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: next.userId },
        select: { id: true, organizationId: true, roleId: true },
      });
      const isAdmin = user.roleId
        ? Boolean(
            (
              await this.prisma.roleDefinition.findUnique({
                where: { id: user.roleId },
                select: { isAdmin: true },
              })
            )?.isAdmin,
          )
        : false;
      return { next, user, isAdmin };
    });
    const accessToken = await this.signAccess({
      sub: user.id,
      org: user.organizationId,
      rid: user.roleId,
      adm: isAdmin,
      sid: next.id,
    });
    return {
      accessToken,
      refreshToken: next.plaintext,
      expiresIn: this.accessTtlSeconds,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    // Public route — the refresh token is the only credential (OT-014).
    const ended = await RequestContextStore.runWithBypass('logout', () => this.refreshTokens.revoke(refreshToken));
    if (!ended) return;
    // Sign-outs were never written to the audit log (F-058).
    const user = await RequestContextStore.runWithBypass('logout', () =>
      this.prisma.user.findUnique({ where: { id: ended.userId }, select: { organizationId: true } }),
    );
    await this.audit.record({
      action: 'LOGOUT',
      entityType: 'User',
      entityId: ended.userId,
      organizationId: user?.organizationId,
      userId: ended.userId,
    });
  }

  /**
   * `client` is where the session is being made from. It is written on the
   * session so the person can tell their sessions apart: without it every row
   * of "Active sessions" read "Unknown device".
   */
  private async issuePair(payload: JwtPayload, client: ClientInfo = {}, how: SignInHow = 'password'): Promise<AuthPair> {
    const refresh = await this.refreshTokens.issue(payload.sub, undefined, client.ip, client.userAgent);
    // The access token names its session, so a password change can keep this one and end the others (F-061).
    const accessToken = await this.signAccess({ ...payload, sid: refresh.id });
    // Every new session is a sign-in the audit log records (F-058: it recorded none).
    await this.audit.record({
      action: 'LOGIN',
      entityType: 'User',
      entityId: payload.sub,
      organizationId: payload.org,
      userId: payload.sub,
      metadata: { sessionId: refresh.id, how },
    });
    return { accessToken, refreshToken: refresh.plaintext, expiresIn: this.accessTtlSeconds };
  }

  /**
   * Public token issuance for flows that create their own org+admin user
   * (e.g. OnboardingService.complete) and need a JWT pair without going through
   * register/login.
   */
  issueTokensForUser(params: {
    userId: string;
    organizationId: string;
    roleId: string;
    isAdmin: boolean;
  }): Promise<AuthPair> {
    // Callers are pre-login flows with no request context; the refresh-token
    // write belongs to the user's own org, so run it there (OT-014).
    return Promise.resolve(
      RequestContextStore.run(
        { userId: params.userId, organizationId: params.organizationId, roleId: params.roleId || null, principalType: 'user' },
        () =>
          this.issuePair(
            {
              sub: params.userId,
              org: params.organizationId,
              rid: params.roleId,
              adm: params.isAdmin,
            },
            {},
            'setup',
          ),
      ),
    );
  }

  private signAccess(payload: JwtPayload): Promise<string> {
    return this.jwt.signAsync(payload, { expiresIn: `${this.accessTtlSeconds}s` });
  }

  private publicUser(user: {
    id: string;
    email: string;
    fullName: string;
    organizationId: string;
    roleId: string | null;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roleId: user.roleId,
    };
  }

  private async verifyMfaForLogin(
    userId: string,
    code: string,
    secret: string,
    recoveryHashes: string[],
  ): Promise<boolean> {
    if (verifyTotp(code, secret)) {
      return true;
    }
    const hashed = createHash('sha256').update(code).digest('hex');
    if (recoveryHashes.includes(hashed)) {
      // Consume the used recovery code
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaRecoveryHashes: recoveryHashes.filter((h) => h !== hashed),
        },
      });
      return true;
    }
    return false;
  }
}

/** Whether a person's status means their pending invitation no longer stands. */
export function isWithdrawnInvitee(status: string): boolean {
  return status === 'SUSPENDED' || status === 'ARCHIVED' || status === 'DELETED' || status === 'PURGED';
}
