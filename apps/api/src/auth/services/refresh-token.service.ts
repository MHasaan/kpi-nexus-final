import { createHash, randomBytes } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';

export interface IssuedRefreshToken {
  plaintext: string;
  expiresAt: Date;
}

/**
 * Refresh-token lifecycle: issue (random 32-byte token, SHA-256 hash stored
 * in DB), rotate (revoke old + issue new, linked via `replacedById`), and
 * detect reuse (presented token whose `revokedAt IS NOT NULL` and
 * `replacedById IS NULL` → kill the entire chain).
 */
@Injectable()
export class RefreshTokenService {
  private readonly ttlDays = 30;

  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    deviceInfo?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<IssuedRefreshToken> {
    const plaintext = randomBytes(32).toString('base64url');
    const hashedToken = this.hash(plaintext);
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken,
        deviceInfo,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });
    return { plaintext, expiresAt };
  }

  /**
   * Validate, rotate, return new token. Throws UnauthorizedException on
   * unknown token, expired token, or detected reuse (which also revokes the
   * entire downstream chain).
   */
  async rotate(presentedToken: string): Promise<IssuedRefreshToken & { userId: string }> {
    const hashedToken = this.hash(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { hashedToken },
    });
    if (!existing) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid refresh token' });
    }
    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Refresh token expired' });
    }
    if (existing.revokedAt !== null) {
      // Reuse detection: someone presented a revoked token. If the revoked
      // token has no replacement, this is the legitimate user — fine. If it
      // already has a replacement, the chain is compromised.
      if (existing.replacedById !== null) {
        await this.revokeChain(existing.id);
        throw new UnauthorizedException({
          code: 'UNAUTHENTICATED',
          message: 'Refresh token chain revoked due to suspected reuse',
        });
      }
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Refresh token revoked' });
    }

    const next = await this.issue(existing.userId);
    const nextRecord = await this.prisma.refreshToken.findUnique({
      where: { hashedToken: this.hash(next.plaintext) },
      select: { id: true },
    });

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: nextRecord?.id },
    });

    return { ...next, userId: existing.userId };
  }

  async revoke(presentedToken: string): Promise<void> {
    const hashedToken = this.hash(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { hashedToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Walk the `replacedById` chain forward from a compromised token and revoke every link. */
  private async revokeChain(startId: string): Promise<void> {
    const seen = new Set<string>();
    let cursorId: string | null = startId;
    while (cursorId !== null && !seen.has(cursorId)) {
      seen.add(cursorId);
      const record: {
        id: string;
        replacedById: string | null;
        revokedAt: Date | null;
      } | null = await this.prisma.refreshToken.findUnique({
        where: { id: cursorId },
        select: { id: true, replacedById: true, revokedAt: true },
      });
      if (!record) break;
      if (record.revokedAt === null) {
        await this.prisma.refreshToken.update({
          where: { id: record.id },
          data: { revokedAt: new Date() },
        });
      }
      cursorId = record.replacedById;
    }
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
