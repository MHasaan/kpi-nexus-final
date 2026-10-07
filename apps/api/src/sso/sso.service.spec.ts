/**
 * SsoService unit tests. handleVerifiedLogin takes an IdP-verified profile
 * (email/name) — the SAML/OIDC exchange itself is WorkOS-backed — and either
 * logs in an existing user or JIT-provisions one, issuing a JWT pair. Covers:
 * existing user, JIT provision (ACTIVE + default role), JIT disabled, inactive
 * config, unknown org.
 */
import { type Mock, describe, expect, test, vi } from 'vitest';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import type { AuthService } from '../auth/auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { SsoService } from './sso.service.js';

function makeService(opts: { active?: boolean; jit?: boolean } = {}) {
  const users: Array<{ id: string; organizationId: string; email: string; fullName: string; roleId: string | null; status: string }> = [
    { id: 'existing', organizationId: 'org_a', email: 'known@x.test', fullName: 'Known', roleId: 'role_emp', status: 'ACTIVE' },
  ];
  let n = 1;
  const prisma = {
    organization: { findFirst: vi.fn(async ({ where }: { where: { slug: string } }) => (where.slug === 'acme' ? { id: 'org_a' } : null)) },
    ssoConfig: {
      findUnique: vi.fn(async ({ where }: { where: { organizationId: string } }) =>
        where.organizationId === 'org_a'
          ? { isActive: opts.active ?? true, allowJitProvisioning: opts.jit ?? true, defaultRoleId: 'role_default' }
          : null,
      ),
    },
    user: {
      findFirst: vi.fn(async ({ where }: { where: { organizationId: string; email: string } }) =>
        users.find((u) => u.organizationId === where.organizationId && u.email === where.email) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const u = { id: `jit_${n++}`, organizationId: data.organizationId as string, email: data.email as string, fullName: data.fullName as string, roleId: (data.roleId as string) ?? null, status: data.status as string };
        users.push(u);
        return u;
      }),
    },
    roleDefinition: { findFirst: vi.fn(async () => ({ isAdmin: false })) },
  };
  const auth = { issueTokensForUser: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 })) };
  const service = new SsoService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  return { service, prisma, auth, users };
}

describe('SsoService.handleVerifiedLogin', () => {
  test('logs in an existing user and issues tokens', async () => {
    const { service, auth } = makeService();
    const res = await service.handleVerifiedLogin({ orgSlug: 'acme', email: 'known@x.test', fullName: 'Known' });
    expect(res.accessToken).toBe('a');
    expect(auth.issueTokensForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'existing', organizationId: 'org_a' }));
  });

  test('JIT-provisions a new user as ACTIVE with the default role', async () => {
    const { service, users } = makeService({ jit: true });
    await service.handleVerifiedLogin({ orgSlug: 'acme', email: 'new@x.test', fullName: 'New Person' });
    const created = users.find((u) => u.email === 'new@x.test');
    expect(created).toBeDefined();
    expect(created!.status).toBe('ACTIVE');
    expect(created!.roleId).toBe('role_default');
  });

  test('rejects an unknown user when JIT is disabled', async () => {
    const { service } = makeService({ jit: false });
    await expect(service.handleVerifiedLogin({ orgSlug: 'acme', email: 'new@x.test', fullName: 'New' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('rejects when the SSO config is inactive', async () => {
    const { service } = makeService({ active: false });
    await expect(service.handleVerifiedLogin({ orgSlug: 'acme', email: 'known@x.test', fullName: 'Known' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  test('rejects an unknown org slug', async () => {
    const { service } = makeService();
    await expect(service.handleVerifiedLogin({ orgSlug: 'ghost', email: 'x@y', fullName: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SsoService.handleVerifiedLogin — runs pre-auth under the RLS bypass (OT-014)', () => {
  test('org, user and role lookups (and JIT create) all see bypassRls', async () => {
    const { service, prisma } = makeService({ jit: true });
    const seen: Array<boolean | undefined> = [];
    const fns = [prisma.organization.findFirst, prisma.user.findFirst, prisma.user.create, prisma.roleDefinition.findFirst] as unknown as Mock[];
    for (const fn of fns) {
      const impl = fn.getMockImplementation()!;
      fn.mockImplementation(async (...args: unknown[]) => {
        seen.push(RequestContextStore.get()?.bypassRls);
        return impl(...args);
      });
    }
    await service.handleVerifiedLogin({ orgSlug: 'acme', email: 'new@x.test', fullName: 'New' });
    expect(seen).toEqual([true, true, true, true]);
  });
});
