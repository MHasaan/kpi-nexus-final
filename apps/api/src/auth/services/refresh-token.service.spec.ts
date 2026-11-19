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
