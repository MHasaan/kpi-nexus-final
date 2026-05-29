import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { InviteUserDto } from './dto/invite-user.dto.js';
import { purgedHandle } from './services/purge-handle.js';

export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
  createdAt: Date;
}

export interface InviteResult {
  user: PublicUser;
  /** Plaintext token — only included when NODE_ENV !== 'production'. */
  inviteToken?: string;
  /** Frontend accept-invitation URL — only when NODE_ENV !== 'production'. */
  acceptUrl?: string;
}

const userSelect = {
  id: true,
  email: true,
  fullName: true,
  status: true,
  roleId: true,
  managerId: true,
  positionId: true,
  createdAt: true,
} as const;

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(): Promise<PublicUser[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId },
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string): Promise<PublicUser> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: userSelect,
    });
    if (!user) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    }
    return user;
  }

  /**
   * GDPR hard-purge: requires the user already be ARCHIVED (offboard first).
   * Redacts PII to a deterministic, non-reversible handle, drops all auth
   * tokens, and nulls the user's recorded-by data-point references. Audited
   * with the redacted handle only — no PII in the log.
   */
  async purge(userId: string): Promise<{ handle: string }> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'user not found' });
    if (user.status !== 'ARCHIVED') {
      throw new UnprocessableEntityException({
        code: 'NOT_ARCHIVED',
        message: 'User must be ARCHIVED (offboarded) before it can be purged',
        details: { status: user.status },
      });
    }

    const handle = purgedHandle(ctx.organizationId, userId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `${handle}@purged.local`,
          fullName: 'Former User',
          phone: null,
          secondaryEmail: null,
          passwordHash: null,
          mfaSecret: null,
          status: 'PURGED',
          managerId: null,
        },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.emailVerificationToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.kPIDataPoint.updateMany({ where: { organizationId: ctx.organizationId, recordedById: userId }, data: { recordedById: null } }),
    ]);

    await this.audit.record({
      action: 'DELETE',
      entityType: 'User',
      entityId: userId,
      metadata: { gdprPurge: true, handle },
      redactedKeys: ['email', 'fullName', 'phone'],
    });
    return { handle };
  }

  /**
   * Invite a user — creates the User in INVITED status (no passwordHash yet)
   * and mints a single-use EmailVerificationToken. In non-production env we
   * return the plaintext token + accept URL on the response so the FE / e2e
   * can drive the accept flow without scraping the api log. Production omits
   * those fields; the email handoff goes through EmailService when that
   * module lands.
   */
  async invite(dto: InviteUserDto): Promise<InviteResult> {
    const ctx = RequestContextStore.require();

    if (dto.roleId) {
      const role = await this.prisma.roleDefinition.findFirst({
        where: { id: dto.roleId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!role) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'roleId is invalid or belongs to another tenant',
        });
      }
    }
    if (dto.positionId) {
      const position = await this.prisma.position.findFirst({
        where: { id: dto.positionId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!position) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'positionId is invalid or belongs to another tenant',
        });
      }
    }

    const existing = await this.prisma.user.findUnique({
      where: { organizationId_email: { organizationId: ctx.organizationId, email: dto.email } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'A user with this email already exists in this organization',
      });
    }

    const plaintext = randomBytes(32).toString('base64url');
    const hashedToken = this.hash(plaintext);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    const { user } = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: ctx.organizationId,
          email: dto.email,
          fullName: dto.fullName,
          status: 'INVITED',
          roleId: dto.roleId,
          positionId: dto.positionId,
          invitedAt: new Date(),
          invitedById: ctx.userId,
        },
        select: userSelect,
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          hashedToken,
          expiresAt,
        },
      });
      return { user };
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'User',
      entityId: user.id,
      metadata: { reason: 'invited', email: dto.email },
    });

    const isDev = process.env.NODE_ENV !== 'production';
    const acceptUrl = isDev ? this.acceptUrlForDev(plaintext) : undefined;
    if (isDev) {
      this.logger.log(`[invite] ${dto.email} → ${acceptUrl} (expires ${expiresAt.toISOString()})`);
    }

    return {
      user,
      inviteToken: isDev ? plaintext : undefined,
      acceptUrl,
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private acceptUrlForDev(token: string): string {
    const webBase =
      process.env.NEXT_PUBLIC_WEB_URL ??
      (process.env.NEXT_PUBLIC_API_URL?.replace(':4000', ':3000') ?? 'http://localhost:3000');
    return `${webBase}/accept-invitation?token=${token}`;
  }
}
