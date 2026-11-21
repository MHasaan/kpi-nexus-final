/**
 * Unit tests for AccountService — self-service profile + password endpoints.
 *
 *  - updateProfile: changes ONLY fullName, org-scoped, returns public user shape.
 *  - changePassword: rejects wrong current password; rejects weak new password
 *    (org policy); on success re-hashes (new verifies, old does not) and revokes
 *    other sessions.
 *
 * Prisma, AuditService, PermissionResolverService and RefreshTokenService are
 * mocked. bcrypt is real so we exercise the actual hash/verify path.
 */
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { describe, expect, test, vi } from 'vitest';

import { ALL_PERMISSIONS, PermissionKey } from '@kpi-nexus/contracts';

import type { AuditService } from '../../audit/audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { PermissionResolverService } from '../../rbac/services/permission-resolver.service.js';
import { RequestContextStore, type RequestContext } from '../../tenancy/request-context.js';
import type { RefreshTokenService } from './refresh-token.service.js';
import { AccountService } from './account.service.js';

const fakeCtx: RequestContext = {
  organizationId: 'org_1',
  userId: 'user_1',
  roleId: 'role_1',
  principalType: 'user',
};

const baseDbUser = {
  id: 'user_1',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  organizationId: 'org_1',
  roleId: 'role_1',
  mfaEnabled: false,
  status: 'ACTIVE',
  notificationSettings: null,
  onboardingCompletedAt: null as Date | null,
};

interface Mocks {
  prisma: PrismaService;
  audit: AuditService;
  resolver: PermissionResolverService;
  refreshTokens: RefreshTokenService;
  updateMock: ReturnType<typeof vi.fn>;
  revokeAllMock: ReturnType<typeof vi.fn>;
  revokeAllExceptSessionMock: ReturnType<typeof vi.fn>;
  auditMock: ReturnType<typeof vi.fn>;
}

function makeMocks(opts: {
  passwordHash?: string | null;
  passwordPolicy?: unknown;
  resolved?: { isAdmin: boolean; permissions: ReadonlySet<PermissionKey> };
} = {}): { service: AccountService } & Mocks {
  const updateMock = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...baseDbUser,
    ...data,
  }));
  const revokeAllMock = vi.fn().mockResolvedValue(undefined);
  const auditMock = vi.fn().mockResolvedValue(undefined);

  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        ...baseDbUser,
        passwordHash: opts.passwordHash ?? null,
        organization: { passwordPolicy: opts.passwordPolicy ?? null },
      }),
      update: updateMock,
    },
  } as unknown as PrismaService;

  const audit = { record: auditMock } as unknown as AuditService;
  const revokeAllExceptSessionMock = vi.fn().mockResolvedValue({ revoked: 1 });
  const refreshTokens = { revokeAllForUser: revokeAllMock, revokeAllExceptSession: revokeAllExceptSessionMock } as unknown as RefreshTokenService;
  const resolver = {
    resolveForCurrentPrincipal: vi.fn().mockResolvedValue(
      opts.resolved ?? { isAdmin: false, permissions: new Set([PermissionKey.KPI_VIEW]) },
    ),
  } as unknown as PermissionResolverService;

  const service = new AccountService(prisma, audit, resolver, refreshTokens);
  return { service, prisma, audit, resolver, refreshTokens, updateMock, revokeAllMock, revokeAllExceptSessionMock, auditMock };
}

describe('AccountService.updateProfile', () => {
  test('updates only fullName, org-scoped, returns public user shape', async () => {
    const { service, updateMock } = makeMocks();

    const result = await RequestContextStore.run(fakeCtx, () =>
      service.updateProfile({ fullName: 'Jane Q. Doe' }),
    );

    // Org-scoped where clause
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(call.where).toEqual({ id: 'user_1', organizationId: 'org_1' });
    // ONLY fullName in the data payload — no role/status/email/etc.
    expect(Object.keys(call.data)).toEqual(['fullName']);
    expect(call.data.fullName).toBe('Jane Q. Doe');

    // Returned shape includes permissions + immutable identity fields untouched
    expect(result.fullName).toBe('Jane Q. Doe');
    expect(result.email).toBe('jane@example.com');
    expect(result.roleId).toBe('role_1');
    expect(result.status).toBe('ACTIVE');
    expect(Array.isArray(result.permissions)).toBe(true);
  });

  test('language is saved on the person, and nothing else changes (plan 6.2)', async () => {
    const { service, updateMock, auditMock } = makeMocks();

    await RequestContextStore.run(fakeCtx, () => service.updateProfile({ language: 'fr' }));

    const call = updateMock.mock.calls[0]![0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(call.where).toEqual({ id: 'user_1', organizationId: 'org_1' });
    expect(call.data).toEqual({ language: 'fr' });
    // A language choice is a preference, not a profile change worth an audit row.
    expect(auditMock).not.toHaveBeenCalled();
  });

  test('a personal timezone is saved, and null goes back to the organisation\'s (plan 6.2)', async () => {
    const { service, updateMock } = makeMocks();

    await RequestContextStore.run(fakeCtx, () => service.updateProfile({ timezone: 'Asia/Karachi' }));
    await RequestContextStore.run(fakeCtx, () => service.updateProfile({ timezone: null }));

    const data = updateMock.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
    expect(data).toEqual([{ timezone: 'Asia/Karachi' }, { timezone: null }]);
  });

  test('tourCompleted stamps onboardingCompletedAt and nothing else (plan 3.4)', async () => {
    const { service, updateMock, auditMock } = makeMocks();

    const result = await RequestContextStore.run(fakeCtx, () => service.updateProfile({ tourCompleted: true }));

    const call = updateMock.mock.calls[0]![0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(call.where).toEqual({ id: 'user_1', organizationId: 'org_1' });
    expect(Object.keys(call.data)).toEqual(['onboardingCompletedAt']);
    expect(call.data.onboardingCompletedAt).toBeInstanceOf(Date);
    expect(result.onboardingCompletedAt).toBeInstanceOf(Date);
    // Finishing a tour is not a profile change worth an audit row.
    expect(auditMock).not.toHaveBeenCalled();
  });

  test('a rename and a finished tour can arrive together', async () => {
    const { service, updateMock, auditMock } = makeMocks();
    await RequestContextStore.run(fakeCtx, () => service.updateProfile({ fullName: 'Jane Q. Doe', tourCompleted: true }));
    const call = updateMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(Object.keys(call.data).sort()).toEqual(['fullName', 'onboardingCompletedAt']);
    expect(auditMock).toHaveBeenCalledTimes(1);
  });

  test('admin principal — returns all canonical permissions', async () => {
    const { service } = makeMocks({
      resolved: { isAdmin: true, permissions: new Set() },
    });

    const result = await RequestContextStore.run(fakeCtx, () =>
      service.updateProfile({ fullName: 'Admin Person' }),
    );
    expect(result.permissions).toHaveLength(ALL_PERMISSIONS.length);
  });
});

// Real bcrypt at cost 12 (several hashes per test): fast when idle, but it can
// exceed the 5s default while the whole suite runs in parallel.
describe('AccountService.changePassword', { timeout: 30_000 }, () => {
  test('rejects when current password is wrong', async () => {
    const currentHash = await bcrypt.hash('RightCurrent1', 12);
    const { service, updateMock, revokeAllMock } = makeMocks({ passwordHash: currentHash });

    await expect(
      RequestContextStore.run(fakeCtx, () =>
        service.changePassword({ currentPassword: 'WrongCurrent1', newPassword: 'BrandNewPass1' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(updateMock).not.toHaveBeenCalled();
    expect(revokeAllMock).not.toHaveBeenCalled();
  });

  test('rejects when user has no password hash (SSO-only)', async () => {
    const { service } = makeMocks({ passwordHash: null });
    await expect(
      RequestContextStore.run(fakeCtx, () =>
        service.changePassword({ currentPassword: 'anything', newPassword: 'BrandNewPass1' }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('rejects when new password violates org policy (too short)', async () => {
    const currentHash = await bcrypt.hash('RightCurrent1', 12);
    const { service, updateMock } = makeMocks({
      passwordHash: currentHash,
      passwordPolicy: { minLength: 12 },
    });

    await expect(
      RequestContextStore.run(fakeCtx, () =>
        service.changePassword({ currentPassword: 'RightCurrent1', newPassword: 'short' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(updateMock).not.toHaveBeenCalled();
  });

  test('rejects when new password fails complexity policy', async () => {
    const currentHash = await bcrypt.hash('RightCurrent1', 12);
    const { service } = makeMocks({
      passwordHash: currentHash,
      passwordPolicy: { minLength: 8, requireUppercase: true, requireDigit: true },
    });

    await expect(
      RequestContextStore.run(fakeCtx, () =>
        service.changePassword({ currentPassword: 'RightCurrent1', newPassword: 'alllowercase' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  test('on success: re-hashes (new verifies, old does not), revokes sessions, audits', async () => {
    const currentHash = await bcrypt.hash('RightCurrent1', 12);
    const { service, updateMock, revokeAllMock, auditMock } = makeMocks({
      passwordHash: currentHash,
    });

    await RequestContextStore.run(fakeCtx, () =>
      service.changePassword({ currentPassword: 'RightCurrent1', newPassword: 'BrandNewPass1' }),
    );

    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as {
      where: Record<string, unknown>;
      data: { passwordHash: string };
    };
    expect(call.where).toEqual({ id: 'user_1', organizationId: 'org_1' });
    const newHash = call.data.passwordHash;
    expect(typeof newHash).toBe('string');
    // The new hash verifies the new password and NOT the old one
    expect(await bcrypt.compare('BrandNewPass1', newHash)).toBe(true);
    expect(await bcrypt.compare('RightCurrent1', newHash)).toBe(false);

    // Made under a token with no session id (before F-061): every session is revoked, as before. Audited.
    expect(revokeAllMock).toHaveBeenCalledWith('user_1');
    expect(auditMock).toHaveBeenCalledTimes(1);
    const auditArg = auditMock.mock.calls[0]![0] as { metadata?: { passwordChanged?: boolean } };
    expect(auditArg.metadata?.passwordChanged).toBe(true);
  });
});

// Manual QA (2026-11-20, F-061): changing your password signed you out of the session you did it from, after
// the page had half-worked for a while. The session the change is made from is kept; the others go.
describe('AccountService.changePassword — keeps the session it was made from', () => {
  test('with a session id in the request, every other session is revoked and this one stays', async () => {
    const currentHash = await bcrypt.hash('RightCurrent1', 12);
    const { service, revokeAllMock, revokeAllExceptSessionMock } = makeMocks({ passwordHash: currentHash });

    await RequestContextStore.run({ ...fakeCtx, sessionId: 'sess_1' }, () =>
      service.changePassword({ currentPassword: 'RightCurrent1', newPassword: 'BrandNewPass1' }),
    );

    expect(revokeAllExceptSessionMock).toHaveBeenCalledWith('user_1', 'sess_1');
    expect(revokeAllMock).not.toHaveBeenCalled();
  });
});
