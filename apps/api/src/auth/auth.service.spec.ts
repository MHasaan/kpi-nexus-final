/**
 * Unit tests for AuthService.previewInvitation().
 *
 * The public POST /auth/invitation-preview endpoint resolves a (hashed)
 * invitation token to its pending user + organization and returns only the
 * invitee email, the org name, and the token expiry. Cases:
 *
 *   - valid pending token  → returns { email, organizationName, expiresAt }
 *   - unknown token        → NotFoundException (generic, no leak)
 *   - consumed token       → NotFoundException
 *   - expired token        → NotFoundException
 *
 * Prisma is mocked; jwt/config/refreshTokens are unused by this method.
 */
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';

import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { AuthService } from './auth.service.js';
import type { RefreshTokenService } from './services/refresh-token.service.js';

const RAW_TOKEN = 'invite-token-123';
const HASHED = createHash('sha256').update(RAW_TOKEN).digest('hex');

function makeService(prisma: unknown): AuthService {
  return new AuthService(
    prisma as PrismaService,
    {} as JwtService,
    {} as ConfigService,
    {} as RefreshTokenService,
  );
}

describe('AuthService.previewInvitation()', () => {
  test('valid pending token → returns email + organizationName + expiresAt', async () => {
    const expiresAt = new Date('2026-12-31T00:00:00.000Z');
    const findToken = vi.fn().mockResolvedValue({
      id: 'evt_1',
      userId: 'user_1',
      hashedToken: HASHED,
      expiresAt,
      consumedAt: null,
    });
    const findUser = vi.fn().mockResolvedValue({
      email: 'invitee@example.com',
      passwordHash: null,
      status: 'INVITED',
      organization: { name: 'Acme Corp', passwordPolicy: { minLength: 12, requireDigit: true } },
    });
    const prisma = {
      emailVerificationToken: { findUnique: findToken },
      user: { findUnique: findUser },
    };

    const result = await makeService(prisma).previewInvitation({ token: RAW_TOKEN });

    expect(result).toEqual({
      email: 'invitee@example.com',
      organizationName: 'Acme Corp',
      expiresAt: expiresAt.toISOString(),
      // The organisation's own rules, so the page can say them before a password is typed (plan 6.5).
      passwordRules: ['at least 12 characters', 'a digit'],
    });
    // Token must be looked up by its sha256 hash, never the raw value.
    expect(findToken).toHaveBeenCalledWith({ where: { hashedToken: HASHED } });
  });

  test('unknown token → NotFoundException (no leak of which)', async () => {
    const prisma = {
      emailVerificationToken: { findUnique: vi.fn().mockResolvedValue(null) },
      user: { findUnique: vi.fn() },
    };

    await expect(
      makeService(prisma).previewInvitation({ token: RAW_TOKEN }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test.each(['SUSPENDED', 'ARCHIVED', 'DELETED', 'PURGED'])(
    'invitee who is %s (invitation withdrawn) → NotFoundException, same as a bad token',
    async (status) => {
      const prisma = {
        emailVerificationToken: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'evt_1',
            userId: 'user_1',
            hashedToken: HASHED,
            expiresAt: new Date(Date.now() + 60_000),
            consumedAt: null,
          }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            email: 'invitee@example.com',
            passwordHash: null,
            status,
            organization: { name: 'Acme Corp' },
          }),
        },
      };

      await expect(
        makeService(prisma).previewInvitation({ token: RAW_TOKEN }),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  test('already-consumed token → NotFoundException', async () => {
    const prisma = {
      emailVerificationToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_1',
          userId: 'user_1',
          hashedToken: HASHED,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: new Date(),
        }),
      },
      user: { findUnique: vi.fn() },
    };

    await expect(
      makeService(prisma).previewInvitation({ token: RAW_TOKEN }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('expired token → NotFoundException', async () => {
    const prisma = {
      emailVerificationToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'evt_1',
          userId: 'user_1',
          hashedToken: HASHED,
          expiresAt: new Date(Date.now() - 60_000),
          consumedAt: null,
        }),
      },
      user: { findUnique: vi.fn() },
    };

    await expect(
      makeService(prisma).previewInvitation({ token: RAW_TOKEN }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('AuthService.login() — attempt auditing (OT-009)', () => {
  test('records the client IP and user agent on the login attempt', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
      loginAttempt: { create },
    };
    await expect(
      makeService(prisma).login({ email: 'nobody@example.test', password: 'x' }, { ip: '203.0.113.9', userAgent: 'audit-agent/1.0' }),
    ).rejects.toThrow();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'nobody@example.test', status: 'USER_NOT_FOUND', ipAddress: '203.0.113.9', userAgent: 'audit-agent/1.0' }),
    });
  });
});

describe('AuthService.login() — password maximum age (plan 6.5)', () => {
  const user = (passwordChangedAt: Date | null) => ({
    id: 'u1',
    organizationId: 'org_a',
    email: 'ada@example.test',
    status: 'ACTIVE',
    roleId: null,
    mfaEnabled: false,
    mfaSecret: null,
    passwordHash: bcrypt.hashSync('correct-horse', 4),
    passwordChangedAt,
  });
  const make = (passwordChangedAt: Date | null, maxAgeDays: number) => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(user(passwordChangedAt)) },
      organization: { findUnique: vi.fn().mockResolvedValue({ passwordPolicy: { minLength: 8, maxAgeDays } }) },
      loginAttempt: { create },
    };
    return { create, service: makeService(prisma) };
  };

  test('a password older than the organisation allows is refused with PASSWORD_EXPIRED, and the attempt says why', async () => {
    const { service, create } = make(new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), 90);
    const err = await service.login({ email: 'ada@example.test', password: 'correct-horse' }).catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(401);
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ code: 'PASSWORD_EXPIRED' });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'INVALID_CREDENTIALS', reason: 'password_expired' }) });
  });

  test('a wrong password is still "invalid credentials" — expiry is only told to someone who knows the password', async () => {
    const { service } = make(new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), 90);
    const err = await service.login({ email: 'ada@example.test', password: 'wrong' }).catch((e: unknown) => e);
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

// POST /auth/refresh is public: the caller is identified only by the refresh
// token, so the User/RoleDefinition lookups are cross-tenant by nature and must
// run under the RLS bypass — like login (OT-014).
describe('AuthService.refresh() — runs its lookups under the RLS bypass (OT-014)', () => {
  test('user + role lookups see bypassRls, and the new pair is issued', async () => {
    const seen: Array<boolean | undefined> = [];
    const prisma = {
      user: {
        findUniqueOrThrow: vi.fn(async () => {
          seen.push(RequestContextStore.get()?.bypassRls);
          return { id: 'u1', organizationId: 'org_a', roleId: 'r1' };
        }),
      },
      roleDefinition: {
        findUnique: vi.fn(async () => {
          seen.push(RequestContextStore.get()?.bypassRls);
          return { isAdmin: true };
        }),
      },
    };
    const jwt = { signAsync: vi.fn(async () => 'access-token') };
    const refreshTokens = { rotate: vi.fn(async () => ({ userId: 'u1', plaintext: 'next-refresh' })) };
    const service = new AuthService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      {} as ConfigService,
      refreshTokens as unknown as RefreshTokenService,
    );

    await expect(service.refresh('old-refresh')).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'next-refresh',
      expiresIn: 900,
    });
    expect(seen).toEqual([true, true]);
    expect(jwt.signAsync).toHaveBeenCalledWith(expect.objectContaining({ sub: 'u1', org: 'org_a', adm: true }), expect.anything());
  });
});
