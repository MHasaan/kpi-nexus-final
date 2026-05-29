/**
 * ApiKeysService unit tests. In-memory Prisma fake + no-op audit.
 * Covers: create returns one-time plaintext + stores only a hash; verify
 * happy/unknown/revoked/expired; revoke is tenant-scoped.
 */
import { createHash } from 'node:crypto';
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { ApiKeysService } from './api-keys.service.js';

interface FakeKey {
  id: string;
  organizationId: string;
  name: string;
  hashedKey: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdById: string;
}

class FakePrisma {
  private n = 1;
  keys: FakeKey[] = [];

  apiKey = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.keys.filter((k) => k.organizationId === where.organizationId),
    ),
    findUnique: vi.fn(async ({ where }: { where: { hashedKey: string } }) =>
      this.keys.find((k) => k.hashedKey === where.hashedKey) ?? null,
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.keys.find((k) => k.id === where.id && k.organizationId === where.organizationId) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const k: FakeKey = {
        id: `key_${this.n++}`,
        organizationId: data.organizationId as string,
        name: data.name as string,
        hashedKey: data.hashedKey as string,
        keyPrefix: data.keyPrefix as string,
        scopes: data.scopes as string[],
        lastUsedAt: null,
        expiresAt: (data.expiresAt as Date) ?? null,
        revokedAt: null,
        createdAt: new Date(),
        createdById: data.createdById as string,
      };
      this.keys.push(k);
      return k;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const k = this.keys.find((k) => k.id === where.id)!;
      Object.assign(k, data);
      return k;
    }),
  };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

const ORG = 'org_alpha';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    {
      userId: ctx.userId ?? 'u1',
      organizationId: ctx.organizationId ?? ORG,
      roleId: ctx.roleId ?? null,
      principalType: ctx.principalType ?? 'user',
    },
    fn,
  );
}

function makeService() {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const service = new ApiKeysService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma };
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('ApiKeysService.create', () => {
  test('returns one-time plaintext (kpinx_) and stores only a hash', async () => {
    const { service, prisma } = makeService();
    const { apiKey, plaintext } = await withCtx({}, () =>
      service.create({ name: 'CI key', scopes: ['KPI_DATA_ENTRY'] }),
    );
    expect(plaintext.startsWith('kpinx_')).toBe(true);
    // Stored hash matches the plaintext hash; plaintext itself is not stored.
    expect(prisma.keys[0]!.hashedKey).toBe(sha256(plaintext));
    expect(prisma.keys[0]!.hashedKey).not.toContain(plaintext);
    expect(apiKey.keyPrefix.length).toBe(12);
    // publicSelect excludes hashedKey (enforced by the PublicApiKey type).
  });
});

describe('ApiKeysService.verify', () => {
  test('verifies a valid key and returns org + scopes', async () => {
    const { service } = makeService();
    const { plaintext } = await withCtx({}, () =>
      service.create({ name: 'k', scopes: ['KPI_DATA_ENTRY', 'KPI_VIEW'] }),
    );
    const verified = await service.verify(plaintext);
    expect(verified).not.toBeNull();
    expect(verified!.organizationId).toBe(ORG);
    expect(verified!.scopes).toContain('KPI_DATA_ENTRY');
  });

  test('rejects a non-kpinx token without a DB hit', async () => {
    const { service, prisma } = makeService();
    expect(await service.verify('Bearer-junk')).toBeNull();
    expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
  });

  test('rejects an unknown key', async () => {
    const { service } = makeService();
    expect(await service.verify('kpinx_unknownnnnn')).toBeNull();
  });

  test('rejects a revoked key', async () => {
    const { service } = makeService();
    const { apiKey, plaintext } = await withCtx({}, () =>
      service.create({ name: 'k', scopes: [] }),
    );
    await withCtx({}, () => service.revoke(apiKey.id));
    expect(await service.verify(plaintext)).toBeNull();
  });

  test('rejects an expired key', async () => {
    const { service, prisma } = makeService();
    const { plaintext } = await withCtx({}, () =>
      service.create({ name: 'k', scopes: [], expiresAt: new Date(Date.now() - 1000) }),
    );
    void prisma;
    expect(await service.verify(plaintext)).toBeNull();
  });
});

describe('ApiKeysService.revoke', () => {
  test('404 when revoking a key from another tenant', async () => {
    const { service } = makeService();
    const { apiKey } = await withCtx({ organizationId: 'org_a' }, () =>
      service.create({ name: 'k', scopes: [] }),
    );
    await expect(
      withCtx({ organizationId: 'org_b' }, () => service.revoke(apiKey.id)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
