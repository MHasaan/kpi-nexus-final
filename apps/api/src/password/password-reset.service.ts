import { createHash, randomBytes } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { RefreshTokenService } from '../auth/services/refresh-token.service.js';
import {
  checkPasswordPolicy,
  resolvePasswordPolicy,
} from './password-policy.js';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly tokenTtlMs = 60 * 60 * 1000; // 1 hour
  private readonly bcryptRounds = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Always returns void (caller responds 202). Email is logged for the
   * Mailhog wiring that lands with the EmailService task. We don't reveal
   * whether the email exists.
   */
  async request(email: string): Promise<void> {
    await RequestContextStore.runWithBypass('password-reset-request', async () => {
      const user = await this.prisma.user.findFirst({
        where: { email, status: 'ACTIVE' },
        select: { id: true, organizationId: true, email: true },
      });
      if (!user) {
        this.logger.log(`password-reset requested for unknown email — no-op`);
        return;
      }

      const plaintext = randomBytes(32).toString('base64url');
      const hashedToken = this.hash(plaintext);
      const expiresAt = new Date(Date.now() + this.tokenTtlMs);

      // Invalidate any outstanding reset tokens for this user
      await this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, hashedToken, expiresAt },
      });

      // TODO(p1-email): hand off to EmailService — for now, log the link
      // so dev can copy it from the api stdout / Pino transport.
      this.logger.log(
        `[password-reset] link for ${user.email}: ${this.resetUrl(plaintext)} (expires ${expiresAt.toISOString()})`,
      );

      await this.audit.record({
        action: 'UPDATE',
        entityType: 'PasswordResetToken',
        entityId: user.id,
        metadata: { reason: 'requested' },
      });
    });
  }

  async confirm(token: string, newPassword: string): Promise<void> {
    await RequestContextStore.runWithBypass('password-reset-confirm', async () => {
      const hashedToken = this.hash(token);
      const record = await this.prisma.passwordResetToken.findUnique({
        where: { hashedToken },
      });
      if (!record) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Invalid or expired reset token',
        });
      }
      if (record.consumedAt) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Token already used',
        });
      }
      if (record.expiresAt.getTime() < Date.now()) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Token expired',
        });
      }

      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: record.userId },
        include: { organization: { select: { passwordPolicy: true } } },
      });

      const policy = resolvePasswordPolicy(user.organization.passwordPolicy);
      const violations = checkPasswordPolicy(newPassword, policy);
      if (violations.length > 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Password does not meet policy',
          details: { violations },
        });
      }

      const passwordHash = await bcrypt.hash(newPassword, this.bcryptRounds);

      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: user.id },
          data: { passwordHash },
        }),
        this.prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { consumedAt: new Date() },
        }),
      ]);

      // Revoke all refresh tokens — force re-login on every device
      await this.refreshTokens.revokeAllForUser(user.id);

      await this.audit.record({
        action: 'UPDATE',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'password-reset-completed' },
      });

      this.logger.log(`password reset completed for user ${user.id}`);
    });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private resetUrl(token: string): string {
    const webUrl = process.env.NEXT_PUBLIC_API_URL?.replace(':4000', ':3000') ?? 'http://localhost:3000';
    return `${webUrl}/auth/password/reset?token=${token}`;
  }
}
