/**
 * P3.6 — EmbedTokenService unit tests.
 *
 * Pure unit. PrismaService is replaced with an in-memory fake.
 * Tests cover:
 *   - mint → resolve round-trip: payload kpiId + orgId preserved
 *   - tampered signature rejected (401)
 *   - expired token rejected (410)
 *   - missing KPI after resolve → 404
 *   - threshold status computed correctly for HIGHER_IS_BETTER
 */

import { describe, expect, test, vi } from 'vitest';
import { GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';

import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import { EmbedTokenService } from './services/embed-token.service.js';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const ORG = 'org_embed_test';
const KPI_ID = 'kpi_embed_1';

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  const full: RequestContext = {
    userId: ctx.userId ?? 'u1',
    organizationId: ctx.organizationId ?? ORG,
    roleId: ctx.roleId ?? null,
    principalType: ctx.principalType ?? 'user',
  };
  return RequestContextStore.run(full, fn);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fake Prisma
// ──────────────────────────────────────────────────────────────────────────────

interface FakeKpi {
  id: string;
  organizationId: string;
  name: string;
  unit: string | null;
  targetValue: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  direction: string;
  embedTokenVersion: number;
  deletedAt: Date | null;
}

interface FakeDataPoint {
  organizationId: string;
  kpiId: string;
  recordedAt: Date;
  value: number;
}

class FakePrisma {
  kpiStore: FakeKpi[] = [];
  dataPointStore: FakeDataPoint[] = [];

  kPI = {
    findFirst: vi.fn(
      async ({ where }: { where: { id: string; organizationId: string; deletedAt: null } }) => {
        return (
          this.kpiStore.find(
            (k) =>
              k.id === where.id &&
              k.organizationId === where.organizationId &&
              k.deletedAt === null,
          ) ?? null
        );
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { embedTokenVersion: { increment: number } };
      }) => {
        const kpi = this.kpiStore.find((k) => k.id === where.id);
        if (!kpi) throw new Error('KPI not found');
        kpi.embedTokenVersion += data.embedTokenVersion.increment;
        return kpi;
      },
    ),
  };

  kPIDataPoint = {
    findMany: vi.fn(
      async ({ where }: { where: { organizationId: string; kpiId: string } }) => {
        return this.dataPointStore
          .filter((p) => p.organizationId === where.organizationId && p.kpiId === where.kpiId)
          .slice(0, 30);
      },
    ),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('EmbedTokenService', () => {
  function makeService(prisma: FakePrisma) {
    return new EmbedTokenService(
      prisma as unknown as import('../prisma/prisma.service.js').PrismaService,
    );
  }

  test('mint + resolve round-trip: kpiId and orgId preserved', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Revenue',
      unit: 'USD',
      targetValue: 1000,
      warningThreshold: 500,
      criticalThreshold: 200,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: KPI_ID,
      recordedAt: new Date('2026-05-01'),
      value: 750,
    });

    const service = makeService(prisma);

    const token = await withCtx({}, () => service.mint(KPI_ID));
    expect(typeof token).toBe('string');
    expect(token.includes('.')).toBe(true);

    const snapshot = await service.resolve(token);
    expect(snapshot.kpiId).toBe(KPI_ID);
    expect(snapshot.kpiName).toBe('Revenue');
    expect(snapshot.latestValue).toBe(750);
    expect(snapshot.sparkline).toHaveLength(1);
  });

  test('tampered signature → UnauthorizedException', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Revenue',
      unit: 'USD',
      targetValue: 1000,
      warningThreshold: 500,
      criticalThreshold: 200,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    const service = makeService(prisma);

    const token = await withCtx({}, () => service.mint(KPI_ID));
    // Corrupt the signature portion.
    const parts = token.split('.');
    const tampered = parts[0] + '.invalidsignatureXXX';

    await expect(service.resolve(tampered)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('expired token → GoneException', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);

    // Construct a token with exp = 1 (epoch second 1 — definitely expired).
    const payload = { kpiId: KPI_ID, orgId: ORG, exp: 1 };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const { createHmac } = await import('node:crypto');
    const secret = process.env['EMBED_TOKEN_SECRET'] ?? 'dev-embed-secret-change-me-in-prod';
    const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const expiredToken = `${payloadB64}.${sig}`;

    await expect(service.resolve(expiredToken)).rejects.toBeInstanceOf(GoneException);
  });

  test('KPI deleted → NotFoundException', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Revenue',
      unit: 'USD',
      targetValue: 1000,
      warningThreshold: 500,
      criticalThreshold: 200,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    const service = makeService(prisma);

    // Mint while the KPI exists, then soft-delete it so resolve cannot find it.
    const token = await withCtx({}, () => service.mint(KPI_ID));
    prisma.kpiStore[0]!.deletedAt = new Date();

    // Token is valid but KPI no longer exists.
    await expect(service.resolve(token)).rejects.toBeInstanceOf(NotFoundException);
  });

  test('mint requires an existing KPI → NotFoundException for unknown KPI', async () => {
    const prisma = new FakePrisma();
    // No KPI in store → mint must reject (it fetches the version first).
    const service = makeService(prisma);

    await expect(
      withCtx({}, () => service.mint('nonexistent-kpi')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('threshold status: HIGHER_IS_BETTER — critical when below critical threshold', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Score',
      unit: '%',
      targetValue: 100,
      warningThreshold: 60,
      criticalThreshold: 30,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: KPI_ID,
      recordedAt: new Date(),
      value: 20, // below critical threshold (30)
    });

    const service = makeService(prisma);
    const token = await withCtx({}, () => service.mint(KPI_ID));
    const snapshot = await service.resolve(token);
    expect(snapshot.thresholdStatus).toBe('critical');
  });

  test('threshold status: HIGHER_IS_BETTER — warning when between warning + critical thresholds', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Score',
      unit: '%',
      targetValue: 100,
      warningThreshold: 60,
      criticalThreshold: 30,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: KPI_ID,
      recordedAt: new Date(),
      value: 50, // between warning (60) and critical (30)
    });

    const service = makeService(prisma);
    const token = await withCtx({}, () => service.mint(KPI_ID));
    const snapshot = await service.resolve(token);
    expect(snapshot.thresholdStatus).toBe('warning');
  });

  test('threshold status: ok when above all thresholds (HIGHER_IS_BETTER)', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Score',
      unit: '%',
      targetValue: 100,
      warningThreshold: 60,
      criticalThreshold: 30,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: KPI_ID,
      recordedAt: new Date(),
      value: 80,
    });

    const service = makeService(prisma);
    const token = await withCtx({}, () => service.mint(KPI_ID));
    const snapshot = await service.resolve(token);
    expect(snapshot.thresholdStatus).toBe('ok');
  });

  // ── Revocation via embedTokenVersion ────────────────────────────────────────

  function pushRevocableKpi(prisma: FakePrisma) {
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Revenue',
      unit: 'USD',
      targetValue: 1000,
      warningThreshold: 500,
      criticalThreshold: 200,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
    });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: KPI_ID,
      recordedAt: new Date('2026-05-01'),
      value: 750,
    });
  }

  test('revoke bumps embedTokenVersion and returns the new version', async () => {
    const prisma = new FakePrisma();
    pushRevocableKpi(prisma);
    const service = makeService(prisma);

    const result = await withCtx({}, () => service.revoke(KPI_ID));
    expect(result.embedTokenVersion).toBe(1);
    expect(prisma.kpiStore[0]!.embedTokenVersion).toBe(1);
  });

  test('revoke on unknown KPI → NotFoundException', async () => {
    const prisma = new FakePrisma();
    const service = makeService(prisma);

    await expect(withCtx({}, () => service.revoke('nonexistent-kpi'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('revoke invalidates a previously-minted token (old token → NotFoundException)', async () => {
    const prisma = new FakePrisma();
    pushRevocableKpi(prisma);
    const service = makeService(prisma);

    // Mint a token at version 0, then revoke (bump to version 1).
    const oldToken = await withCtx({}, () => service.mint(KPI_ID));
    await withCtx({}, () => service.revoke(KPI_ID));

    // Old token's v (0) no longer matches the KPI's version (1).
    await expect(service.resolve(oldToken)).rejects.toBeInstanceOf(NotFoundException);
  });

  test('a freshly-minted token after revoke resolves OK', async () => {
    const prisma = new FakePrisma();
    pushRevocableKpi(prisma);
    const service = makeService(prisma);

    // Revoke first (version → 1), then mint a new token carrying v = 1.
    await withCtx({}, () => service.revoke(KPI_ID));
    const freshToken = await withCtx({}, () => service.mint(KPI_ID));

    const snapshot = await service.resolve(freshToken);
    expect(snapshot.kpiId).toBe(KPI_ID);
    expect(snapshot.latestValue).toBe(750);
  });
});
