/**
 * RetentionService unit tests. applyTier upserts a RetentionPolicy per entity
 * type to the tier's day count; list is org-scoped.
 */
import { describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { RETENTION_ENTITY_TYPES } from './retention-tiers.js';
import { RetentionService } from './retention.service.js';

interface FakePolicy { organizationId: string; entityType: string; days: number }

class FakePrisma {
  policies: FakePolicy[] = [];
  retentionPolicy = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => this.policies.filter((p) => p.organizationId === where.organizationId)),
    upsert: vi.fn(async ({ where, create, update }: { where: { organizationId_entityType: { organizationId: string; entityType: string } }; create: FakePolicy; update: { days: number } }) => {
      const key = where.organizationId_entityType;
      const existing = this.policies.find((p) => p.organizationId === key.organizationId && p.entityType === key.entityType);
      if (existing) { existing.days = update.days; return existing; }
      this.policies.push(create);
      return create;
    }),
  };
}

const ORG = 'org_alpha';
function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run({ userId: 'admin', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' }, fn);
}

function makeService() {
  const prisma = new FakePrisma();
  const audit = { record: vi.fn(async () => {}) };
  return { service: new RetentionService(prisma as unknown as PrismaService, audit as unknown as AuditService), prisma };
}

describe('RetentionService', () => {
  test('applyTier(PRO) sets 365 days for every entity type', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.applyTier('PRO'));
    expect(prisma.policies).toHaveLength(RETENTION_ENTITY_TYPES.length);
    expect(prisma.policies.every((p) => p.days === 365)).toBe(true);
  });

  test('applyTier is idempotent (re-apply updates in place)', async () => {
    const { service, prisma } = makeService();
    await withCtx({}, () => service.applyTier('FREE'));
    await withCtx({}, () => service.applyTier('ENTERPRISE'));
    expect(prisma.policies).toHaveLength(RETENTION_ENTITY_TYPES.length);
    expect(prisma.policies.every((p) => p.days === 2555)).toBe(true);
  });

  test('listTiers returns the preset catalog', () => {
    const { service } = makeService();
    const tiers = service.listTiers();
    expect(tiers.map((t) => t.tier).sort()).toEqual(['ENTERPRISE', 'FREE', 'PRO']);
  });

  test('list is org-scoped', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.applyTier('FREE'));
    await withCtx({ organizationId: 'other' }, () => service.applyTier('PRO'));
    const rows = await withCtx({}, () => service.list());
    expect(rows.every((p) => p.days === 90)).toBe(true);
  });
});
