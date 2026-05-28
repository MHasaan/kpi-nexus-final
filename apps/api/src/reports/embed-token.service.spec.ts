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
    // No KPI in store → findFirst returns null.
    const service = makeService(prisma);

    const token = await withCtx({}, () => service.mint('nonexistent-kpi'));
    // Token is valid but KPI does not exist.
    await expect(service.resolve(token)).rejects.toBeInstanceOf(NotFoundException);
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
});
