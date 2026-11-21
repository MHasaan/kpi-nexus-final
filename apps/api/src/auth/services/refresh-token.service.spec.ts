/**
 * Flow walk (sessions): every row of "Active sessions" read "Unknown device".
 * A session is a refresh token, and none was ever written with the browser or
 * address it was made from — so two sessions could not be told apart, and
 * there was no way to pick the one to revoke.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../../prisma/prisma.service.js';
import { RefreshTokenService } from './refresh-token.service.js';

interface Row {
  id: string;
  userId: string;
  hashedToken: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

function make() {
  const rows: Row[] = [];
  const prisma = {
    refreshToken: {
      create: vi.fn(async ({ data }: { data: Partial<Row> & { userId: string; hashedToken: string; expiresAt: Date } }) => {
        const row: Row = {
          id: `rt_${rows.length + 1}`,
          deviceInfo: data.deviceInfo ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          revokedAt: null,
          replacedById: null,
          userId: data.userId,
          hashedToken: data.hashedToken,
          expiresAt: data.expiresAt,
        };
        rows.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { hashedToken: string } }) => rows.find((r) => r.hashedToken === where.hashedToken) ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => Object.assign(rows.find((r) => r.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: { hashedToken?: string; revokedAt?: null }; data: Partial<Row> }) => {
        const hit = rows.filter((r) => (where.hashedToken === undefined || r.hashedToken === where.hashedToken) && (where.revokedAt === undefined || r.revokedAt === null));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
  };
  return { service: new RefreshTokenService(prisma as unknown as PrismaService), rows };
}

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

describe('RefreshTokenService: where a session was made from', () => {
  test('a session is written with the browser and address it was made from', async () => {
    const { service, rows } = make();
    await service.issue('u1', undefined, '203.0.113.7', CHROME);
    expect(rows[0]).toMatchObject({ userId: 'u1', ipAddress: '203.0.113.7', userAgent: CHROME });
  });

  test('renewing a session keeps where it was made from', async () => {
    const { service, rows } = make();
    const first = await service.issue('u1', undefined, '203.0.113.7', CHROME);
    await service.rotate(first.plaintext);
    expect(rows[1]).toMatchObject({ userId: 'u1', ipAddress: '203.0.113.7', userAgent: CHROME });
    expect(rows[0]!.replacedById).toBe(rows[1]!.id);
  });

  test('renewing from a browser that says who it is updates the session to that', async () => {
    const { service, rows } = make();
    const first = await service.issue('u1', undefined, '203.0.113.7', CHROME);
    await service.rotate(first.plaintext, { ip: '198.51.100.2', userAgent: FIREFOX });
    expect(rows[1]).toMatchObject({ ipAddress: '198.51.100.2', userAgent: FIREFOX });
  });

  test('a very long browser string is cut, not refused', async () => {
    const { service, rows } = make();
    await service.issue('u1', undefined, undefined, 'x'.repeat(2000));
    expect(rows[0]!.userAgent).toHaveLength(500);
  });
});

// Manual QA (2026-11-20, F-061): changing your password, or turning two-step sign-in off, signed you out of the
// very session you did it from. A session is a refresh token row; the access token now names its row, so the
// row it was made from can be kept while every other one is revoked.
describe('RefreshTokenService — keeping the current session', () => {
  test('issue returns the id of the row it made, so the access token can name its session', async () => {
    const { service, rows } = make();
    const issued = await service.issue('u1');
    expect(issued.id).toBe('rt_1');
    expect(rows).toHaveLength(1);
  });

  test('revokeAllExceptSession revokes every other live token of the person and keeps the named one', async () => {
    const updateMany = vi.fn(async () => ({ count: 2 }));
    const service = new RefreshTokenService({ refreshToken: { updateMany } } as unknown as PrismaService);

    await expect(service.revokeAllExceptSession('u1', 'rt_7')).resolves.toEqual({ revoked: 2 });

    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, expiresAt: { gt: expect.any(Date) }, id: { not: 'rt_7' } },
      data: { revokedAt: expect.any(Date) },
    });
  });
});

describe('RefreshTokenService.revoke — says whose session it ended', () => {
  test('a live token: revoked, and the owner named; an unknown token: null', async () => {
    const { service } = make();
    const issued = await service.issue('u1');
    await expect(service.revoke(issued.plaintext)).resolves.toEqual({ userId: 'u1' });
    await expect(service.revoke('not-a-token')).resolves.toBeNull();
  });
});
