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

import type { KpisService } from '../kpis/kpis.service.js';
import { isCategoryAllowed } from '../rbac/visibility/kpi-visibility.js';
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
  /** Phase-3 category allowlist gating: null ⇒ uncategorised. */
  categoryId?: string | null;
}

interface FakeDataPoint {
  organizationId: string;
  kpiId: string;
  recordedAt: Date;
  value: number;
  /** Set on a per-person / per-unit value; absent on an organisation-level one. */
  userId?: string | null;
  orgUnitId?: string | null;
}

class FakePrisma {
  kpiStore: FakeKpi[] = [];
  /** Threshold bands of the KPI; none unless a test adds them. */
  bandStore: Array<{ name: string; lower: number | null; upper: number | null; color: string; order: number; consecutivePointsRequired: number }> = [];
  kPIThresholdBand = { findMany: vi.fn(async () => this.bandStore) };
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

  /** roleId returned for the token minter (drives resolveMinterWindow). */
  minterRoleId: string | null = null;
  user = {
    findFirst: vi.fn(async () => ({ roleId: this.minterRoleId })),
  };

  kPIDataPoint = {
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date }; userId?: null; orgUnitId?: null };
      }) => {
        return this.dataPointStore
          .filter(
            (p) =>
              p.organizationId === where.organizationId &&
              p.kpiId === where.kpiId &&
              // Like Prisma: `userId: null` / `orgUnitId: null` keep only rows with none.
              (where.userId === undefined || (p.userId ?? null) === null) &&
              (where.orgUnitId === undefined || (p.orgUnitId ?? null) === null) &&
              (!where.recordedAt || p.recordedAt.getTime() >= where.recordedAt.gte.getTime()),
          )
          .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())
          .slice(0, 30);
      },
    ),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Fake KpisService — mirrors the real getById() visibility gate that mint()/revoke()
// now route through. It 404s missing/soft-deleted KPIs and, when an allowlist is
// set, hides KPIs whose category is not allowed (Phase-3 parity via isCategoryAllowed).
// allowlist === null ⇒ admin/all (parity) — never hides anything.
// ──────────────────────────────────────────────────────────────────────────────

class FakeKpisService {
  /** null ⇒ all/admin (parity); [] ⇒ none; [ids] ⇒ only those. */
  allowlist: readonly string[] | null = null;

  constructor(private readonly prisma: FakePrisma) {}

  getById = vi.fn(async (id: string) => {
    const ctx = RequestContextStore.require();
    const kpi = this.prisma.kpiStore.find(
      (k) => k.id === id && k.organizationId === ctx.organizationId && k.deletedAt === null,
    );
    if (!kpi) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    if (!isCategoryAllowed(this.allowlist, kpi.categoryId ?? null)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    return kpi;
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('EmbedTokenService', () => {
  function makeService(
    prisma: FakePrisma,
    kpis: FakeKpisService = new FakeKpisService(prisma),
    historyWindowDays: number | null = null,
  ) {
    const accessContext = {
      dataLimits: vi.fn(async () => ({
        historyWindowDays,
        maxListRows: null,
        maxExportRows: null,
      })),
    };
    return new EmbedTokenService(
      prisma as unknown as import('../prisma/prisma.service.js').PrismaService,
      kpis as unknown as KpisService,
      accessContext as unknown as import('../rbac/services/access-context.service.js').AccessContextService,
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
    // Latest and sparkline = newest periods, not newest entries (AN-002).
    expect(prisma.kPIDataPoint.findMany.mock.calls[0]![0]).toMatchObject({ orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }] });
  });

  test("Phase 4: resolve clamps the public sparkline to the minter's historyWindowDays", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const seed = (prisma: FakePrisma) => {
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
      prisma.dataPointStore.push(
        { organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date(Date.now() - 60 * DAY), value: 100 },
        { organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date(Date.now() - 1 * DAY), value: 200 },
      );
    };

    // Minter restricted to 7 days ⇒ the 60-day-old point is dropped from the public embed.
    const restricted = new FakePrisma();
    seed(restricted);
    const svc7 = makeService(restricted, new FakeKpisService(restricted), 7);
    const snap = await svc7.resolve(await withCtx({}, () => svc7.mint(KPI_ID)));
    expect(snap.sparkline).toHaveLength(1);
    expect(snap.sparkline[0]!.value).toBe(200);
    expect(snap.latestValue).toBe(200); // out-of-window latest hidden

    // Parity: null window ⇒ both points surface.
    const open = new FakePrisma();
    seed(open);
    const svcOpen = makeService(open, new FakeKpisService(open), null);
    const snap2 = await svcOpen.resolve(await withCtx({}, () => svcOpen.mint(KPI_ID)));
    expect(snap2.sparkline).toHaveLength(2);
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

  // ── SECURITY: Phase-3 category allowlist on mint()/revoke() ──────────────────
  // Closes the embed-token leak — a non-admin could previously mint a public
  // token for a category-restricted (or out-of-scope) KPI and read its name +
  // value series via the @Public resolve endpoint. mint()/revoke() now route the
  // lookup through KpisService.getById(), which enforces the allowlist (404s).

  function pushCategorisedKpi(prisma: FakePrisma, categoryId: string | null) {
    prisma.kpiStore.push({
      id: KPI_ID,
      organizationId: ORG,
      name: 'Confidential Revenue',
      unit: 'USD',
      targetValue: 1000,
      warningThreshold: 500,
      criticalThreshold: 200,
      direction: 'HIGHER_IS_BETTER',
      embedTokenVersion: 0,
      deletedAt: null,
      categoryId,
    });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: KPI_ID,
      recordedAt: new Date('2026-05-01'),
      value: 750,
    });
  }

  test('mint on a category-restricted KPI → NotFoundException (leak closed)', async () => {
    const prisma = new FakePrisma();
    pushCategorisedKpi(prisma, 'cat_finance');
    const kpis = new FakeKpisService(prisma);
    // Caller is allowed only the "marketing" category — finance KPI is hidden.
    kpis.allowlist = ['cat_marketing'];
    const service = makeService(prisma, kpis);

    await expect(withCtx({}, () => service.mint(KPI_ID))).rejects.toBeInstanceOf(NotFoundException);
    // The KPI was never inspected for an embedTokenVersion past the guard.
    expect(kpis.getById).toHaveBeenCalledWith(KPI_ID);
  });

  test('mint hides an uncategorised KPI when an allowlist is set (null category)', async () => {
    const prisma = new FakePrisma();
    pushCategorisedKpi(prisma, null);
    const kpis = new FakeKpisService(prisma);
    kpis.allowlist = ['cat_marketing'];
    const service = makeService(prisma, kpis);

    await expect(withCtx({}, () => service.mint(KPI_ID))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('revoke on a category-restricted KPI → NotFoundException (leak closed)', async () => {
    const prisma = new FakePrisma();
    pushCategorisedKpi(prisma, 'cat_finance');
    const kpis = new FakeKpisService(prisma);
    kpis.allowlist = ['cat_marketing'];
    const service = makeService(prisma, kpis);

    await expect(withCtx({}, () => service.revoke(KPI_ID))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    // Version must NOT have been bumped — the guard short-circuited before update.
    expect(prisma.kpiStore[0]!.embedTokenVersion).toBe(0);
  });

  test('mint succeeds when the KPI category is on the allowlist (parity)', async () => {
    const prisma = new FakePrisma();
    pushCategorisedKpi(prisma, 'cat_finance');
    const kpis = new FakeKpisService(prisma);
    kpis.allowlist = ['cat_finance', 'cat_marketing'];
    const service = makeService(prisma, kpis);

    const token = await withCtx({}, () => service.mint(KPI_ID));
    expect(typeof token).toBe('string');
    const snapshot = await service.resolve(token);
    expect(snapshot.kpiId).toBe(KPI_ID);
    expect(snapshot.latestValue).toBe(750);
  });

  test('mint succeeds for admins / null allowlist regardless of category (parity)', async () => {
    const prisma = new FakePrisma();
    pushCategorisedKpi(prisma, 'cat_finance');
    const kpis = new FakeKpisService(prisma);
    kpis.allowlist = null; // admin / unconfigured ⇒ all categories
    const service = makeService(prisma, kpis);

    const token = await withCtx({}, () => service.mint(KPI_ID));
    const snapshot = await service.resolve(token);
    expect(snapshot.kpiId).toBe(KPI_ID);
    expect(snapshot.latestValue).toBe(750);
  });

  // BE-049: the embed is public. Like the share link (BE-047), it must show only the
  // organisation-level value — never the newest value of whichever person or unit
  // recorded last on a per-person or per-unit KPI.
  test('a public embed never shows a per-person or per-unit value (BE-049)', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({ id: KPI_ID, organizationId: ORG, name: 'Calls', unit: null, targetValue: null, warningThreshold: null, criticalThreshold: null, direction: 'HIGHER_IS_BETTER', embedTokenVersion: 0, deletedAt: null });
    prisma.dataPointStore.push(
      { organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date('2026-11-10T00:00:00Z'), value: 50 },
      { organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date('2026-11-17T00:00:00Z'), value: 7, userId: 'someone' },
      { organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date('2026-11-18T00:00:00Z'), value: 9, orgUnitId: 'a-unit' },
    );
    const service = makeService(prisma);
    const token = await withCtx({}, () => service.mint(KPI_ID));
    const snapshot = await service.resolve(token);
    expect(snapshot.latestValue).toBe(50);
    expect(snapshot.sparkline.map((p) => p.value)).toEqual([50]);
  });

  test('a KPI with only per-person values shows no value in a public embed (BE-049)', async () => {
    const prisma = new FakePrisma();
    prisma.kpiStore.push({ id: KPI_ID, organizationId: ORG, name: 'Calls', unit: null, targetValue: null, warningThreshold: null, criticalThreshold: null, direction: 'HIGHER_IS_BETTER', embedTokenVersion: 0, deletedAt: null });
    prisma.dataPointStore.push({ organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date('2026-11-17T00:00:00Z'), value: 7, userId: 'someone' });
    const service = makeService(prisma);
    const token = await withCtx({}, () => service.mint(KPI_ID));
    const snapshot = await service.resolve(token);
    expect(snapshot.latestValue).toBeNull();
    expect(snapshot.sparkline).toEqual([]);
  });

  // QA-L13: the embed had a health rule of its own. With a value and a target but no
  // thresholds it answered "unknown", which the page printed as "No data" next to the value.
  describe('status follows the one health rule (QA-L13)', () => {
    const kpi = (over: Record<string, unknown>) => ({ id: KPI_ID, organizationId: ORG, name: 'Score', unit: '%', targetValue: 100, warningThreshold: null, criticalThreshold: null, direction: 'HIGHER_IS_BETTER', embedTokenVersion: 0, deletedAt: null, ...over });
    const statusOf = async (prisma: FakePrisma) => {
      const service = makeService(prisma);
      const token = await withCtx({}, () => service.mint(KPI_ID));
      return (await service.resolve(token)).thresholdStatus;
    };
    const withValue = (value: number, over: Record<string, unknown> = {}) => {
      const prisma = new FakePrisma();
      prisma.kpiStore.push(kpi(over) as never);
      prisma.dataPointStore.push({ organizationId: ORG, kpiId: KPI_ID, recordedAt: new Date(), value });
      return prisma;
    };

    test('a value graded against the target alone is ok / warning / critical — not "unknown"', async () => {
      expect(await statusOf(withValue(120))).toBe('ok');
      expect(await statusOf(withValue(40))).toBe('critical');
    });

    test('a value with nothing to grade it against has no status, and is not "no data"', async () => {
      expect(await statusOf(withValue(40, { targetValue: null }))).toBe('no_target');
    });

    test('no value at all is unknown', async () => {
      const prisma = new FakePrisma();
      prisma.kpiStore.push(kpi({}) as never);
      expect(await statusOf(prisma)).toBe('unknown');
    });

    test('a threshold band decides when there is one', async () => {
      const prisma = withValue(120);
      prisma.bandStore.push({ name: 'At risk', lower: 100, upper: null, color: '#f59e0b', order: 0, consecutivePointsRequired: 1 });
      expect(await statusOf(prisma)).toBe('warning');
    });
  });
});
