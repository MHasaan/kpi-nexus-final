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
import { EmailService } from '../email/email.service.js';
import { webAppUrl } from '../email/web-app-url.js';
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
    private readonly email: EmailService,
  ) {}

  /**
   * Always returns void (caller responds 202) and never reveals whether the
   * email exists. Known users are emailed a single-use link to the web app's
   * /reset-password page. The token only ever leaves in that email — it is
   * never logged.
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

      await this.sendResetEmail(user.id, user.email, plaintext);

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

  /**
   * Delivery failures are logged (without the link) and swallowed: the caller
   * always gets the same 202, so a failure can't be used to probe accounts.
   */
  private async sendResetEmail(userId: string, to: string, token: string): Promise<void> {
    const link = webAppUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    const minutes = Math.round(this.tokenTtlMs / 60_000);
    try {
      await this.email.send({
        to,
        subject: 'Reset your KPI Nexus password',
        html:
          `<p>We received a request to reset the password for your KPI Nexus account.</p>` +
          `<p><a href="${link}">Choose a new password</a></p>` +
          `<p>This link expires in ${minutes} minutes and can be used once. ` +
          `If you didn't ask for this, you can ignore this email — your password won't change.</p>`,
        text: `Reset your KPI Nexus password: ${link}\n\nThis link expires in ${minutes} minutes and can be used once. If you didn't ask for this, ignore this email.`,
      });
      this.logger.log(`password-reset email sent (user ${userId})`);
    } catch (err) {
      this.logger.warn(`password-reset email failed (user ${userId}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
