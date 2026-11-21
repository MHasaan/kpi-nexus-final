import { createHash, randomBytes } from 'node:crypto';

import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service.js';

export interface ActiveSessionInfo {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface IssuedRefreshToken {
  /** The session's row id: the access token names it (`sid`), so the session a change is made from can be kept. */
  id: string;
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
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        hashedToken,
        deviceInfo,
        ipAddress,
        // Kept so a person can tell their sessions apart; a browser string has no fixed length.
        userAgent: userAgent?.slice(0, 500),
        expiresAt,
      },
    });
    return { id: row.id, plaintext, expiresAt };
  }

  /**
   * Validate, rotate, return new token. Throws UnauthorizedException on
   * unknown token, expired token, or detected reuse (which also revokes the
   * entire downstream chain).
   */
  async rotate(
    presentedToken: string,
    client: { ip?: string; userAgent?: string } = {},
  ): Promise<IssuedRefreshToken & { userId: string }> {
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

    // The renewed session is still the same one: it keeps where it was made
    // from, unless the caller renewing it says where it is now.
    const next = await this.issue(
      existing.userId,
      existing.deviceInfo ?? undefined,
      client.ip ?? existing.ipAddress ?? undefined,
      client.userAgent ?? existing.userAgent ?? undefined,
    );
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

  /** End the session the token belongs to. Says whose it was, so the sign-out can be audited; null for a token that is not live. */
  async revoke(presentedToken: string): Promise<{ userId: string } | null> {
    const hashedToken = this.hash(presentedToken);
    const row = await this.prisma.refreshToken.findUnique({ where: { hashedToken }, select: { userId: true, revokedAt: true } });
    if (!row || row.revokedAt) return null;
    await this.prisma.refreshToken.updateMany({
      where: { hashedToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { userId: row.userId };
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Session-management API (used by MeSessionsController)
  // -------------------------------------------------------------------------

  /**
   * List all active (non-revoked, non-expired) refresh-token sessions for a
   * user. Returns metadata only — `hashedToken` is never included.
   */
  async listActiveForUser(userId: string): Promise<ActiveSessionInfo[]> {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        deviceInfo: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Which of `userId`'s live sessions the presented refresh token belongs to, or
   * null. Looked up by the token's hash and limited to that user, so a token of
   * someone else's names nothing.
   */
  async currentSessionId(userId: string, presentedToken: string): Promise<string | null> {
    const row = await this.prisma.refreshToken.findFirst({
      where: { userId, hashedToken: this.hash(presentedToken), revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Revoke a single session by its row id, but ONLY if it belongs to `userId`.
   * Walks the replacement chain via `revokeChain`. Throws NotFoundException
   * when the row is missing or belongs to a different user.
   */
  async revokeOne(userId: string, tokenId: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { id: tokenId },
      select: { id: true, userId: true },
    });

    if (!record || record.userId !== userId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'session not found' });
    }

    await this.revokeChain(tokenId);
  }

  /**
   * Revoke all active sessions for `userId`. If `keepPresentedToken` is
   * supplied, the row whose `hashedToken` matches is excluded from revocation
   * so the caller remains logged in.
   *
   * Returns `{ revoked: number }` — the number of rows updated.
   */
  async revokeAllExcept(
    userId: string,
    keepPresentedToken?: string,
  ): Promise<{ revoked: number }> {
    const where: Parameters<typeof this.prisma.refreshToken.updateMany>[0]['where'] = {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };

    if (keepPresentedToken) {
      const keepHash = this.hash(keepPresentedToken);
      where.hashedToken = { not: keepHash };
    }

    const result = await this.prisma.refreshToken.updateMany({
      where,
      data: { revokedAt: new Date() },
    });

    return { revoked: result.count };
  }

  /**
   * Revoke every live session of the person except the one named (the row the caller's access token was
   * issued with). Changing a password or turning two-step sign-in off used to revoke the caller's own
   * session too, so the page half-worked until the access token ran out (F-061).
   */
  async revokeAllExceptSession(userId: string, sessionId: string): Promise<{ revoked: number }> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, id: { not: sessionId } },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
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
