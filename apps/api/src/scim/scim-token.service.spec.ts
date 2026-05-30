/**
 * ScimTokenService unit tests. Mints a bearer token (plaintext returned once,
 * stored hashed), verifies + resolves the org, and rejects revoked/expired/
 * unknown tokens. Org-scoped list + revoke.
 */
import { describe, expect, test, vi } from 'vitest';

import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { ScimTokenService } from './scim-token.service.js';

interface FakeToken {
  id: string;
  organizationId: string;
  label: string;
  hashedToken: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

class FakePrisma {
  private n = 1;
  tokens: FakeToken[] = [];

  scimToken = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const t: FakeToken = {
        id: `scim_${this.n++}`,
        organizationId: data.organizationId as string,
        label: data.label as string,
        hashedToken: data.hashedToken as string,
        expiresAt: (data.expiresAt as Date) ?? null,
        revokedAt: null,
      };
      this.tokens.push(t);
      return t;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.tokens.find((t) => t.hashedToken === where.hashedToken) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.tokens
        .filter((t) => t.organizationId === where.organizationId)
        .map(({ hashedToken: _h, ...rest }) => rest),
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const t = this.tokens.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) (t as unknown as Record<string, unknown>)[k] = data[k];
      return t;
    }),
  };
}

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const audit = { record: vi.fn(async () => {}) };
  return { service: new ScimTokenService(prisma as unknown as PrismaService, audit as unknown as never), prisma };
}

describe('ScimTokenService', () => {
  test('mint returns a plaintext token and stores only the hash', async () => {
    const { service, prisma } = makeService();
    const { token } = await withCtx({}, () => service.mint('Okta'));
    expect(token).toMatch(/^scim_/);
    expect(prisma.tokens[0]!.hashedToken).not.toBe(token);
  });

  test('verifyAndResolve returns the org for a valid token', async () => {
    const { service } = makeService();
    const { token } = await withCtx({}, () => service.mint('Okta'));
    expect(await service.verifyAndResolve(token)).toBe(ORG);
  });

  test('verifyAndResolve rejects an unknown token', async () => {
    const { service } = makeService();
    expect(await service.verifyAndResolve('scim_nope')).toBeNull();
  });

  test('verifyAndResolve rejects a revoked token', async () => {
    const { service, prisma } = makeService();
    const { token, id } = await withCtx({}, () => service.mint('Okta'));
    await withCtx({}, () => service.revoke(id));
    expect(prisma.tokens[0]!.revokedAt).not.toBeNull();
    expect(await service.verifyAndResolve(token)).toBeNull();
  });

  test('verifyAndResolve rejects an expired token', async () => {
    const { service, prisma } = makeService();
    const { token } = await withCtx({}, () => service.mint('Okta'));
    prisma.tokens[0]!.expiresAt = new Date(Date.now() - 1000);
    expect(await service.verifyAndResolve(token)).toBeNull();
  });

  test('list is org-scoped and never returns the hash', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.mint('A'));
    await withCtx({ organizationId: 'other' }, () => service.mint('B'));
    const rows = await withCtx({}, () => service.list());
    expect(rows).toHaveLength(1);
    expect((rows[0] as Record<string, unknown>).hashedToken).toBeUndefined();
  });
});
