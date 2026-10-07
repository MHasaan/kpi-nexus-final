import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { RefreshTokenService } from '../auth/services/refresh-token.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { MfaService } from './mfa.service.js';

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
