/**
 * Unit tests for MeSessionsController + the three new RefreshTokenService methods.
 *
 * Tests (TDD — written before implementation):
 *   - listActiveForUser: returns only active rows for the caller, excludes
 *     revoked/expired rows, excludes other users' rows, never leaks hashedToken.
 *   - revokeOne: revokes caller's token; revokeOne on another user's token →
 *     NotFoundException and no DB write.
 *   - revokeAllExcept: with keep-token revokes all but kept; without keep revokes all.
 *   - Controller routes delegate correctly to the service.
 */

import { NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi, beforeEach } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { RefreshTokenService } from './services/refresh-token.service.js';
import { MeSessionsController } from './me-sessions.controller.js';

// ---------------------------------------------------------------------------
// Shared fake context
// ---------------------------------------------------------------------------
const fakeCtx: RequestContext = {
  organizationId: 'org_test',
  userId: 'user_alice',
  roleId: 'role_test',
  principalType: 'user',
};

// ---------------------------------------------------------------------------
// Helpers to build fake RefreshToken rows
// ---------------------------------------------------------------------------
const now = new Date('2026-01-15T12:00:00Z');
const future = new Date('2026-02-15T12:00:00Z');
const past = new Date('2026-01-01T12:00:00Z');

function makeRow(overrides: Partial<{
  id: string;
  userId: string;
  hashedToken: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}> = {}) {
  return {
    id: 'tok_1',
    userId: 'user_alice',
    hashedToken: 'hash_abc',
    deviceInfo: 'Chrome on Mac',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: now,
    expiresAt: future,
    revokedAt: null,
    replacedById: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RefreshTokenService — listActiveForUser
// ---------------------------------------------------------------------------
describe('RefreshTokenService.listActiveForUser', () => {
  function makeService(rows: ReturnType<typeof makeRow>[]) {
    const prisma = {
      refreshToken: {
        findMany: vi.fn().mockResolvedValue(rows),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    } as unknown as PrismaService;
    return { service: new RefreshTokenService(prisma), prisma };
  }

  test('queries only active rows (revokedAt null, expiresAt > now) for the given user', async () => {
    const activeRow = makeRow();
    const { service, prisma } = makeService([activeRow]);

    const result = await service.listActiveForUser('user_alice');

    // Check query parameters passed to prisma
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const call = (prisma.refreshToken.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.where.userId).toBe('user_alice');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.where.revokedAt).toEqual(null);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.where.expiresAt).toBeDefined();
    // expiresAt filter: { gt: <some date> }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.where.expiresAt.gt).toBeInstanceOf(Date);
    // Order: newest first
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.orderBy).toEqual({ createdAt: 'desc' });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('tok_1');
  });

  test('never selects hashedToken — select clause explicitly excludes it', async () => {
    const { service, prisma } = makeService([makeRow()]);
    await service.listActiveForUser('user_alice');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const call = (prisma.refreshToken.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // select must not include hashedToken
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select).not.toHaveProperty('hashedToken');
    // but must include the safe fields
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select.id).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select.deviceInfo).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select.ipAddress).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select.userAgent).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select.createdAt).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select.expiresAt).toBe(true);
  });

  test('returns empty array when no active sessions', async () => {
    const { service } = makeService([]);
    const result = await service.listActiveForUser('user_alice');
    expect(result).toEqual([]);
  });

  test('select clause includes the expected safe fields and excludes sensitive ones', async () => {
    const { service, prisma } = makeService([makeRow()]);
    await service.listActiveForUser('user_alice');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const call = (prisma.refreshToken.findMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select).toBeDefined();
    // Safe fields present
    const safeFields = ['id', 'deviceInfo', 'ipAddress', 'userAgent', 'createdAt', 'expiresAt'];
    for (const f of safeFields) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(call.select).toHaveProperty(f);
    }
    // Sensitive fields absent
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select).not.toHaveProperty('revokedAt');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select).not.toHaveProperty('hashedToken');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(call.select).not.toHaveProperty('userId');
  });
});

// ---------------------------------------------------------------------------
// RefreshTokenService — revokeOne
// ---------------------------------------------------------------------------
describe('RefreshTokenService.revokeOne', () => {
  function makeService(foundRow: ReturnType<typeof makeRow> | null) {
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue(foundRow),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn(),
      },
    } as unknown as PrismaService;
    return { service: new RefreshTokenService(prisma), prisma };
  }

  test('revokes callers own active token (revokeChain starts at the row id)', async () => {
    const row = makeRow({ id: 'tok_own', userId: 'user_alice', replacedById: null, revokedAt: null });
    const { service, prisma } = makeService(row);

    await service.revokeOne('user_alice', 'tok_own');

    // findUnique called to look up the token
    expect(prisma.refreshToken.findUnique as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tok_own' } }),
    );
    // update called to mark revokedAt (from revokeChain)
    expect(prisma.refreshToken.update as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tok_own' } }),
    );
  });

  test('throws NotFoundException when token belongs to a different user', async () => {
    // Row exists but belongs to user_bob, not user_alice
    const row = makeRow({ id: 'tok_bob', userId: 'user_bob' });
    const { service, prisma } = makeService(row);

    await expect(service.revokeOne('user_alice', 'tok_bob')).rejects.toThrow(NotFoundException);

    // update must NOT have been called
    expect(prisma.refreshToken.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  test('throws NotFoundException when token row does not exist', async () => {
    const { service, prisma } = makeService(null);

    await expect(service.revokeOne('user_alice', 'nonexistent')).rejects.toThrow(NotFoundException);
    expect(prisma.refreshToken.update as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RefreshTokenService — revokeAllExcept
// ---------------------------------------------------------------------------
describe('RefreshTokenService.revokeAllExcept', () => {
  function makeService(activeRows: ReturnType<typeof makeRow>[]) {
    const prisma = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue(null), // used by revokeChain
        findMany: vi.fn().mockResolvedValue(activeRows),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: activeRows.length }),
      },
    } as unknown as PrismaService;
    return { service: new RefreshTokenService(prisma), prisma };
  }

  test('without keepToken — revokes all active tokens for user', async () => {
    const rows = [makeRow({ id: 'tok_1' }), makeRow({ id: 'tok_2' })];
    const { service, prisma } = makeService(rows);

    const result = await service.revokeAllExcept('user_alice');

    expect(result.revoked).toBeGreaterThanOrEqual(0);
    // updateMany should be called (bulk revoke path)
    expect(prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user_alice' }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  test('with keepPresentedToken — excludes the matching row from revocation', async () => {
    // Two tokens; one should be kept
    const keepPlaintext = 'token_to_keep_plaintextAAAA';
    const rows = [
      makeRow({ id: 'tok_keep', userId: 'user_alice' }),
      makeRow({ id: 'tok_revoke', userId: 'user_alice' }),
    ];
    const { service, prisma } = makeService(rows);

    const result = await service.revokeAllExcept('user_alice', keepPlaintext);

    // Should return a count
    expect(typeof result.revoked).toBe('number');
    // updateMany should be called with a NOT filter for the kept token
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const callArgs = (prisma.refreshToken.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(callArgs.where.userId).toBe('user_alice');
    // hashedToken NOT filter must be present when keepPresentedToken is given
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(callArgs.where).toHaveProperty('hashedToken');
  });

  test('returns { revoked: N } shape', async () => {
    const { service } = makeService([makeRow()]);
    const result = await service.revokeAllExcept('user_alice');
    expect(result).toHaveProperty('revoked');
    expect(typeof result.revoked).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// MeSessionsController
// ---------------------------------------------------------------------------
describe('MeSessionsController', () => {
  let mockService: {
    listActiveForUser: ReturnType<typeof vi.fn>;
    revokeOne: ReturnType<typeof vi.fn>;
    revokeAllExcept: ReturnType<typeof vi.fn>;
  };
  let controller: MeSessionsController;

  beforeEach(() => {
    mockService = {
      listActiveForUser: vi.fn().mockResolvedValue([]),
      revokeOne: vi.fn().mockResolvedValue(undefined),
      revokeAllExcept: vi.fn().mockResolvedValue({ revoked: 2 }),
    };
    controller = new MeSessionsController(mockService as unknown as RefreshTokenService);
  });

  test('GET /me/sessions delegates to listActiveForUser with ctx.userId', async () => {
    const sessions = [makeRow()];
    mockService.listActiveForUser.mockResolvedValue(sessions);

    const result = await RequestContextStore.run(fakeCtx, () => controller.list());

    expect(mockService.listActiveForUser).toHaveBeenCalledWith('user_alice');
    expect(result).toBe(sessions);
  });

  test('DELETE /me/sessions/:id delegates to revokeOne and returns void', async () => {
    await RequestContextStore.run(fakeCtx, () => controller.revokeOne('tok_1'));

    expect(mockService.revokeOne).toHaveBeenCalledWith('user_alice', 'tok_1');
  });

  test('DELETE /me/sessions/:id re-throws NotFoundException from service', async () => {
    mockService.revokeOne.mockRejectedValue(
      new NotFoundException({ code: 'NOT_FOUND', message: 'session not found' }),
    );

    await expect(
      RequestContextStore.run(fakeCtx, () => controller.revokeOne('tok_other')),
    ).rejects.toThrow(NotFoundException);
  });

  test('POST /me/sessions/revoke-all without body delegates to revokeAllExcept', async () => {
    const result = await RequestContextStore.run(fakeCtx, () => controller.revokeAll({}));

    expect(mockService.revokeAllExcept).toHaveBeenCalledWith('user_alice', undefined);
    expect(result).toEqual({ revoked: 2 });
  });

  test('POST /me/sessions/revoke-all with keepCurrentRefreshToken passes it through', async () => {
    const result = await RequestContextStore.run(fakeCtx, () =>
      controller.revokeAll({ keepCurrentRefreshToken: 'my_token_plaintext' }),
    );

    expect(mockService.revokeAllExcept).toHaveBeenCalledWith('user_alice', 'my_token_plaintext');
    expect(result).toEqual({ revoked: 2 });
  });

  test('POST /me/sessions/revoke-all rejects unknown fields (strict schema)', async () => {
    await expect(
      RequestContextStore.run(fakeCtx, () =>
        controller.revokeAll({ unknownField: 'value' } as Record<string, unknown>),
      ),
    ).rejects.toThrow();
  });
});
