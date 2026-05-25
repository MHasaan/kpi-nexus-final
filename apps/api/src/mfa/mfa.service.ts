import { createHash } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RefreshTokenService } from '../auth/services/refresh-token.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  generateOtpAuthUrl,
  generateRecoveryCodes,
  generateSecret,
  verifyTotp,
} from './totp.js';

export interface EnrollmentResult {
  secret: string;
  otpauthUrl: string;
  /** Plain recovery codes — shown to user ONCE; hashed on confirm. */
  recoveryCodes: string[];
}

@Injectable()
export class MfaService {
  private readonly issuer = 'KPI Nexus';

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async enroll(): Promise<EnrollmentResult> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { email: true, mfaEnabled: true },
    });
    if (user.mfaEnabled) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: 'MFA is already enabled. Disable it first to re-enroll.',
      });
    }

    const secret = generateSecret();
    const recoveryCodes = generateRecoveryCodes(10);

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        mfaPendingSecret: secret,
        // recoveryHashes stored as SHA-256 after confirm() — keep
        // plain values only on the wire response below.
      },
    });

    return {
      secret,
      otpauthUrl: generateOtpAuthUrl({
        secret,
        account: user.email,
        issuer: this.issuer,
      }),
      recoveryCodes,
    };
  }

  async confirm(code: string, recoveryCodes: string[]): Promise<void> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { mfaPendingSecret: true, mfaEnabled: true },
    });
    if (user.mfaEnabled) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: 'MFA already enabled',
      });
    }
    if (!user.mfaPendingSecret) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'No pending enrollment — call POST /mfa/enroll first',
      });
    }
    if (!verifyTotp(code, user.mfaPendingSecret)) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid TOTP code',
      });
    }

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
        mfaEnabled: true,
        mfaRecoveryHashes: recoveryCodes.map((c) => this.hash(c)),
      },
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.userId,
      metadata: { reason: 'mfa-enrolled' },
    });
  }

  async disable(code: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { mfaEnabled: true, mfaSecret: true, mfaRecoveryHashes: true },
    });
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException({
        code: 'CONFLICT',
        message: 'MFA is not enabled for this account',
      });
    }
    const ok = await this.verifyCodeAgainstSecretOrRecovery(
      code,
      user.mfaSecret,
      user.mfaRecoveryHashes,
      ctx.userId,
    );
    if (!ok) {
      throw new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Invalid TOTP or recovery code',
      });
    }

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaPendingSecret: null,
        mfaRecoveryHashes: [],
      },
    });

    // Revoke refresh tokens — force re-login post-disable
    await this.refreshTokens.revokeAllForUser(ctx.userId);

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.userId,
      metadata: { reason: 'mfa-disabled' },
    });
  }

  /**
   * Called by AuthService.login when user.mfaEnabled is true. Returns true
   * if the code is valid (TOTP or recovery code — recovery consumed on use).
   */
  async verifyForLogin(userId: string, code: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaRecoveryHashes: true },
    });
    if (!user?.mfaSecret) return false;
    return this.verifyCodeAgainstSecretOrRecovery(
      code,
      user.mfaSecret,
      user.mfaRecoveryHashes,
      userId,
    );
  }

  private async verifyCodeAgainstSecretOrRecovery(
    code: string,
    secret: string,
    recoveryHashes: string[],
    userId: string,
  ): Promise<boolean> {
    if (verifyTotp(code, secret)) {
      return true;
    }
    const hashed = this.hash(code);
    if (recoveryHashes.includes(hashed)) {
      // Consume the recovery code — remove from the array
      const remaining = recoveryHashes.filter((h) => h !== hashed);
      await this.prisma.user.update({
        where: { id: userId },
        data: { mfaRecoveryHashes: remaining },
      });
      return true;
    }
    return false;
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
