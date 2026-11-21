import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { RefreshTokenService } from '../auth/services/refresh-token.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { MfaService } from './mfa.service.js';
import { generateSecret, generateTotp } from './totp.js';

// verifyForLogin runs at login time, before any session/context exists, so
// its User read must run under the RLS bypass (OT-014).
describe('MfaService.verifyForLogin — runs under the RLS bypass (OT-014)', () => {
  test('the user lookup sees bypassRls', async () => {
    const seen: Array<boolean | undefined> = [];
    const prisma = {
      user: {
        findUnique: vi.fn(async () => {
          seen.push(RequestContextStore.get()?.bypassRls);
          return { mfaSecret: null, mfaRecoveryHashes: [] };
        }),
      },
    };
    const service = new MfaService(
      prisma as unknown as PrismaService,
      {} as AuditService,
      {} as RefreshTokenService,
    );
    await expect(service.verifyForLogin('u1', '123456')).resolves.toBe(false);
    expect(seen).toEqual([true]);
  });
});

// Manual QA (2026-11-20, F-061): turning two-step sign-in off revoked the caller's own session too.
describe('MfaService.disable — keeps the session it was made from', () => {
  test('every other session is revoked and this one stays', async () => {
    const secret = generateSecret();
    const prisma = {
      user: {
        findUniqueOrThrow: vi.fn(async () => ({ mfaEnabled: true, mfaSecret: secret, mfaRecoveryHashes: [] })),
        update: vi.fn(async () => ({})),
      },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const refreshTokens = { revokeAllExceptSession: vi.fn(async () => ({ revoked: 1 })), revokeAllForUser: vi.fn(async () => undefined) };
    const service = new MfaService(prisma as unknown as PrismaService, audit as unknown as AuditService, refreshTokens as unknown as RefreshTokenService);

    await RequestContextStore.run(
      { userId: 'u1', organizationId: 'org_1', roleId: null, principalType: 'user', sessionId: 'sess_1' },
      () => service.disable(generateTotp(secret)),
    );

    expect(refreshTokens.revokeAllExceptSession).toHaveBeenCalledWith('u1', 'sess_1');
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mfaEnabled: false }) }));
  });
});
