import { createHash } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { verifyTotp } from '../mfa/totp.js';
import { DEFAULT_ROLES } from './services/default-roles.js';
import { RefreshTokenService } from './services/refresh-token.service.js';
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
  ) {}

  async registerOrganization(
    dto: RegisterOrgDto,
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
            roleId: adminRole.id,
            emailVerifiedAt: new Date(),
            status: 'ACTIVE',
          },
        });

        return { organization, adminUser, adminRole };
      });

      const pair = await this.issuePair({
        sub: adminUser.id,
        org: organization.id,
        rid: adminRole.id,
        adm: true,
      });

      return {
        ...pair,
        user: this.publicUser(adminUser),
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
      };
    });
  }

  async login(dto: LoginDto): Promise<AuthPair & { user: PublicUser }> {
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

      const pair = await this.issuePair({
        sub: user.id,
        org: user.organizationId,
        rid: user.roleId,
        adm: isAdmin,
      });

      return { ...pair, user: this.publicUser(user) };
    });
  }

  async refresh(refreshToken: string): Promise<AuthPair> {
    const next = await this.refreshTokens.rotate(refreshToken);
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
    const accessToken = await this.signAccess({
      sub: user.id,
      org: user.organizationId,
      rid: user.roleId,
      adm: isAdmin,
    });
    return {
      accessToken,
      refreshToken: next.plaintext,
      expiresIn: this.accessTtlSeconds,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(refreshToken);
  }

  private async issuePair(payload: JwtPayload): Promise<AuthPair> {
    const accessToken = await this.signAccess(payload);
    const refresh = await this.refreshTokens.issue(payload.sub);
    return { accessToken, refreshToken: refresh.plaintext, expiresIn: this.accessTtlSeconds };
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
