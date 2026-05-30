/**
 * IntegrationsService unit tests. Tokens are encrypted at rest and never
 * returned by list/get; only getDecryptedTokens (internal) reveals them.
 * Covers org-scoped CRUD, status updates, token rotation, cross-tenant 404.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { IntegrationCryptoService } from './integration-crypto.service.js';
import { IntegrationsService } from './integrations.service.js';

interface FakeConn {
  id: string;
  organizationId: string;
  provider: string;
  displayName: string | null;
  encryptedTokens: string;
  scopes: string[];
  status: string;
  lastError: string | null;
  metadata: unknown;
  createdById: string;
}

class FakePrisma {
  private n = 1;
  conns: FakeConn[] = [];

  integrationConnection = {
    findMany: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
      this.conns.filter((c) => c.organizationId === where.organizationId).map((c) => project(c, select)),
    ),
    findFirst: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
      const c = this.conns.find((x) => x.id === where.id && x.organizationId === where.organizationId);
      return c ? project(c, select) : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const c: FakeConn = {
        id: `conn_${this.n++}`,
        organizationId: data.organizationId as string,
        provider: data.provider as string,
        displayName: (data.displayName as string) ?? null,
        encryptedTokens: data.encryptedTokens as string,
        scopes: (data.scopes as string[]) ?? [],
        status: (data.status as string) ?? 'PENDING',
        lastError: null,
        metadata: data.metadata ?? null,
        createdById: data.createdById as string,
      };
      this.conns.push(c);
      return c;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const c = this.conns.find((x) => x.id === where.id)!;
      for (const k of Object.keys(data)) if (data[k] !== undefined) (c as unknown as Record<string, unknown>)[k] = data[k];
      return c;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.conns = this.conns.filter((c) => c.id !== where.id);
      return {};
    }),
  };
}

/** Mimic Prisma `select`: keep only selected keys (or all when select absent). */
function project(c: FakeConn, select?: Record<string, boolean>): Record<string, unknown> {
  if (!select) return { ...c };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) if (select[k]) out[k] = (c as unknown as Record<string, unknown>)[k];
  return out;
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const crypto = new IntegrationCryptoService({ INTEGRATION_CRYPTO_KEY: randomBytes(32).toString('hex') });
  const audit = { record: vi.fn(async () => {}) };
  const service = new IntegrationsService(prisma as unknown as PrismaService, audit as unknown as AuditService, crypto);
  return { service, prisma, crypto, audit };
}

describe('IntegrationsService', () => {
  test('create encrypts tokens; list never exposes them', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.create({ provider: 'slack', tokens: { access_token: 'xoxb-secret' }, scopes: ['chat:write'] }));
    // Stored blob is not the plaintext.
    expect(prisma.conns[0]!.encryptedTokens).not.toContain('xoxb-secret');
    const list = await withCtx({}, () => service.list());
    expect((list[0] as Record<string, unknown>).encryptedTokens).toBeUndefined();
    expect(list[0]!.provider).toBe('slack');
  });

  test('getDecryptedTokens returns the original tokens', async () => {
    const { service } = makeService();
    const conn = await withCtx({}, () => service.create({ provider: 'jira', tokens: { access_token: 'a', refresh_token: 'r' } }));
    const tokens = await withCtx({}, () => service.getDecryptedTokens(conn.id));
    expect(tokens).toEqual({ access_token: 'a', refresh_token: 'r' });
  });

  test('list is org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.create({ provider: 'slack', tokens: {} }));
    await withCtx({ organizationId: 'other' }, () => service.create({ provider: 'teams', tokens: {} }));
    const rows = await withCtx({}, () => service.list());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe('slack');
  });

  test('updateStatus records status + error', async () => {
    const { service, prisma } = makeService();
    const conn = await withCtx({}, () => service.create({ provider: 'slack', tokens: {} }));
    await withCtx({}, () => service.updateStatus(conn.id, 'ERROR', 'token expired'));
    expect(prisma.conns[0]!.status).toBe('ERROR');
    expect(prisma.conns[0]!.lastError).toBe('token expired');
  });

  test('rotateTokens re-encrypts under a fresh blob', async () => {
    const { service, prisma } = makeService();
    const conn = await withCtx({}, () => service.create({ provider: 'slack', tokens: { access_token: 'old' } }));
    const before = prisma.conns[0]!.encryptedTokens;
    await withCtx({}, () => service.rotateTokens(conn.id, { access_token: 'new' }));
    expect(prisma.conns[0]!.encryptedTokens).not.toBe(before);
    expect(await withCtx({}, () => service.getDecryptedTokens(conn.id))).toEqual({ access_token: 'new' });
  });

  test('getDecryptedTokens cross-tenant → 404', async () => {
    const { service } = makeService();
    const conn = await withCtx({ organizationId: 'a' }, () => service.create({ provider: 'slack', tokens: {} }));
    await expect(withCtx({ organizationId: 'b' }, () => service.getDecryptedTokens(conn.id))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('audit metadata never carries token material', async () => {
    const { service, audit } = makeService();
    await withCtx({}, () => service.create({ provider: 'slack', tokens: { access_token: 'xoxb-secret' } }));
    const calls = audit.record.mock.calls.map((c) => JSON.stringify(c));
    expect(calls.join(' ')).not.toContain('xoxb-secret');
  });
});
