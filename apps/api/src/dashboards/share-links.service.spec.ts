/**
 * P3.4 — ShareLinksService unit tests.
 *
 * Pure unit. Prisma is replaced with an in-memory fake; AuditService is a
 * no-op spy; DashboardsService is a controllable stub; bcrypt is mocked so
 * tests stay fast. Tests cover:
 *
 *   - create: mints a token; hashes password when given; returned link
 *     includes plaintext token; passwordHash is NOT returned (hasPassword instead)
 *   - list: returns links for the dashboard; never exposes passwordHash;
 *     returns hasPassword boolean
 *   - revoke: sets revokedAt; org-scoped (cross-org → 404)
 *   - resolve: valid token → composed payload + viewCount incremented +
 *     lastViewedAt set; runWithBypass works without a prior RequestContextStore.run()
 *     wrapper; revoked → 404; expired → 410; password-protected wrong/missing → 401;
 *     correct password → success
 */

import { describe, expect, test, vi } from 'vitest';
import { GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';

// Mock bcrypt before importing the service so the service picks up the mock.
// The service uses `import * as bcrypt from 'bcrypt'` so we must export
// hash/compare as top-level named exports (matching the namespace import shape).
vi.mock('bcrypt', () => ({
  hash: vi.fn(async (plain: string) => `hashed:${plain}`),
  compare: vi.fn(async (plain: string, stored: string) => stored === `hashed:${plain}`),
}));

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import type { DashboardsService, PublicDashboard } from './dashboards.service.js';
import { ShareLinksService } from './share-links.service.js';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const ORG = 'org_share_test';
const DASH_ID = 'dash_share_1';

function withCtx<T>(
  ctx: Partial<RequestContext>,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  const full: RequestContext = {
    userId: ctx.userId ?? 'u1',
    organizationId: ctx.organizationId ?? ORG,
    roleId: ctx.roleId ?? null,
    principalType: ctx.principalType ?? 'user',
  };
  return RequestContextStore.run(full, fn);
}

// ────────────────────────────────────────────────────────────────────────────
// Fake types
// ────────────────────────────────────────────────────────────────────────────

interface FakeLink {
  id: string;
  organizationId: string;
  dashboardId: string;
  token: string;
  expiresAt: Date | null;
  viewCount: number;
  passwordHash: string | null;
  lastViewedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdById: string;
  createdBy?: { id: string; fullName: string; email: string };
}

interface FakeDashboardRow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isShared: boolean;
  layout: unknown;
  version: number;
  deletedAt: Date | null;
  widgets: Array<{
    id: string;
    widgetType: string;
    title: string | null;
    config: unknown;
    position: unknown;
    sortOrder: number;
  }>;
}

interface FakeDataPoint {
  organizationId: string;
  kpiId: string;
  value: number;
  recordedAt: Date;
}

interface FakeKpi {
  organizationId: string;
  id: string;
  categoryId: string | null;
}

interface FakeUser {
  id: string;
  organizationId: string;
  roleId: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// FakePrisma
// ────────────────────────────────────────────────────────────────────────────

class FakePrisma {
  private nextId = 1;
  linkStore: FakeLink[] = [];
  dashboardStore: FakeDashboardRow[] = [];
  dataPointStore: FakeDataPoint[] = [];
  kpiStore: FakeKpi[] = [];
  userStore: FakeUser[] = [];

  dashboardShareLink = {
    create: vi.fn(async ({ data }: { data: Partial<FakeLink> & { data?: unknown } }) => {
      const row: FakeLink = {
        id: `link_${this.nextId++}`,
        organizationId: data.organizationId!,
        dashboardId: data.dashboardId!,
        token: data.token!,
        expiresAt: data.expiresAt ?? null,
        viewCount: 0,
        passwordHash: data.passwordHash ?? null,
        lastViewedAt: null,
        revokedAt: null,
        createdAt: new Date(),
        createdById: data.createdById!,
        createdBy: { id: data.createdById!, fullName: 'Test User', email: 'test@example.com' },
      };
      this.linkStore.push(row);
      return { ...row };
    }),

    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return this.linkStore
        .filter((l) => this.matchLink(l, where))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((l) => ({ ...l }));
    }),

    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const l = this.linkStore.find((l) => this.matchLink(l, where));
      return l ? { ...l } : null;
    }),

    findUnique: vi.fn(async ({ where }: { where: { token?: string; id?: string } }) => {
      const l = this.linkStore.find(
        (l) =>
          (where.token !== undefined ? l.token === where.token : true) &&
          (where.id !== undefined ? l.id === where.id : true),
      );
      return l ? { ...l } : null;
    }),

    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake: any covers both numeric and {increment} shapes
        data: Record<string, any>;
      }) => {
        const link = this.linkStore.find((l) => l.id === where.id);
        if (!link) throw new Error(`Link ${where.id} not found`);
        if (data['revokedAt'] !== undefined) link.revokedAt = data['revokedAt'] as Date | null;
        if (data['lastViewedAt'] !== undefined) link.lastViewedAt = data['lastViewedAt'] as Date | null;
        const vc = data['viewCount'];
        if (vc && typeof vc === 'object' && 'increment' in vc) {
          link.viewCount += (vc as { increment: number }).increment;
        }
        return { ...link };
      },
    ),
  };

  dashboard = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { id: string; organizationId: string; deletedAt: null };
      }) => {
        const d = this.dashboardStore.find(
          (d) =>
            d.id === where.id &&
            d.organizationId === where.organizationId &&
            d.deletedAt === null,
        );
        return d ? { ...d } : null;
      },
    ),
  };

  kPIDataPoint = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: {
          organizationId: string;
          kpiId: string;
          recordedAt?: { gte?: Date };
        };
      }) => {
        const gte = where.recordedAt?.gte;
        const dp = this.dataPointStore
          .filter(
            (d) =>
              d.organizationId === where.organizationId &&
              d.kpiId === where.kpiId &&
              (gte === undefined || d.recordedAt.getTime() >= gte.getTime()),
          )
          // newest-first to mirror orderBy: { recordedAt: 'desc' }
          .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime())[0];
        return dp ? { value: dp.value, recordedAt: dp.recordedAt } : null;
      },
    ),
  };

  kPI = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId: string; id: string };
      }) => {
        const kpi = this.kpiStore.find(
          (k) => k.organizationId === where.organizationId && k.id === where.id,
        );
        return kpi ? { categoryId: kpi.categoryId } : null;
      },
    ),
  };

  user = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { id: string; organizationId: string };
      }) => {
        const u = this.userStore.find(
          (x) => x.id === where.id && x.organizationId === where.organizationId,
        );
        return u ? { id: u.id, roleId: u.roleId } : null;
      },
    ),
  };

  private matchLink(l: FakeLink, where: Record<string, unknown>): boolean {
    if (where['id'] !== undefined && l.id !== where['id']) return false;
    if (where['organizationId'] !== undefined && l.organizationId !== where['organizationId'])
      return false;
    if (where['dashboardId'] !== undefined && l.dashboardId !== where['dashboardId'])
      return false;
    if (where['token'] !== undefined && l.token !== where['token']) return false;
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FakeAudit
// ────────────────────────────────────────────────────────────────────────────

class FakeAudit {
  records: Array<Record<string, unknown>> = [];
  record = vi.fn(async (input: Record<string, unknown>) => {
    this.records.push(input);
  });
}

/**
 * Controllable AccessContextService stub. `kpiCategoryAllowlist()` /
 * `dataLimits()` resolve for the *current* principal (the service re-establishes
 * the link creator's context before calling them), keyed here by userId so a
 * test can give different creators different restrictions. `null` ⇒ all (parity
 * / admin).
 */
class FakeAccessContext {
  /** Per-user allowlist; default (any user not listed) is null = parity. */
  allowlistByUser = new Map<string, readonly string[] | null>();
  /** Per-user historyWindowDays; default (any user not listed) is null = parity. */
  historyWindowByUser = new Map<string, number | null>();
  kpiCategoryAllowlist = vi.fn(async () => {
    const ctx = RequestContextStore.require();
    return this.allowlistByUser.has(ctx.userId)
      ? (this.allowlistByUser.get(ctx.userId) ?? null)
      : null;
  });
  dataLimits = vi.fn(async () => {
    const ctx = RequestContextStore.require();
    const historyWindowDays = this.historyWindowByUser.has(ctx.userId)
      ? (this.historyWindowByUser.get(ctx.userId) ?? null)
      : null;
    return {
      historyWindowDays,
      maxListRows: null as number | null,
      maxExportRows: null as number | null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Dashboard stub factory
// ────────────────────────────────────────────────────────────────────────────

function makeDashboardStub(opts: {
  throws?: boolean;
  dashboard?: Partial<PublicDashboard>;
} = {}): DashboardsService {
  const base: PublicDashboard = {
    id: DASH_ID,
    organizationId: ORG,
    name: 'Test Dashboard',
    description: null,
    ownerUserId: 'u1',
    ownerRoleId: null,
    isShared: false,
    isDefault: false,
    layout: null,
    version: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 'u1',
    widgets: [],
    ...opts.dashboard,
  };

  return {
    getById: vi.fn(async () => {
      if (opts.throws) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
      }
      return base;
    }),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setDefault: vi.fn(),
  } as unknown as DashboardsService;
}

// ────────────────────────────────────────────────────────────────────────────
// Service factory
// ────────────────────────────────────────────────────────────────────────────

function makeService(opts: {
  dashboardStub?: DashboardsService;
  prisma?: FakePrisma;
  accessContext?: FakeAccessContext;
} = {}): {
  service: ShareLinksService;
  prisma: FakePrisma;
  audit: FakeAudit;
  accessContext: FakeAccessContext;
} {
  const prisma = opts.prisma ?? new FakePrisma();
  const audit = new FakeAudit();
  const dashboards = opts.dashboardStub ?? makeDashboardStub();
  const accessContext = opts.accessContext ?? new FakeAccessContext();
  const service = new ShareLinksService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    dashboards,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, audit, accessContext };
}

// ────────────────────────────────────────────────────────────────────────────
// Tests: create
// ────────────────────────────────────────────────────────────────────────────

describe('ShareLinksService.create', () => {
  test('mints a token and returns plaintext token in response', async () => {
    const { service } = makeService();
    const result = await withCtx({}, () => service.create(DASH_ID, {}));
    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThan(30);
  });

  test('stores passwordHash when password is given; response has hasPassword:true and NO passwordHash', async () => {
    const { service, prisma } = makeService();
    const result = await withCtx({}, () =>
      service.create(DASH_ID, { password: 'mySecret99' }),
    );
    // The stored row must have a hash.
    const stored = prisma.linkStore[0];
    expect(stored?.passwordHash).toBe('hashed:mySecret99');
    // The response must NOT expose passwordHash; only hasPassword.
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.hasPassword).toBe(true);
  });

  test('hasPassword is false when no password given', async () => {
    const { service } = makeService();
    const result = await withCtx({}, () => service.create(DASH_ID, {}));
    expect(result.hasPassword).toBe(false);
  });

  test('sets createdById from request context', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'user_42' }, () => service.create(DASH_ID, {}));
    expect(prisma.linkStore[0]?.createdById).toBe('user_42');
  });

  test('records an audit entry', async () => {
    const { service, audit } = makeService();
    await withCtx({}, () => service.create(DASH_ID, {}));
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({
      action: 'CREATE',
      entityType: 'DashboardShareLink',
    });
  });

  test('throws 404 when dashboard is not visible / not found', async () => {
    const dashboardStub = makeDashboardStub({ throws: true });
    const { service } = makeService({ dashboardStub });
    await expect(
      withCtx({}, () => service.create('missing_dash', {})),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('stores expiresAt when provided', async () => {
    const { service, prisma } = makeService();
    const future = new Date(Date.now() + 3_600_000);
    await withCtx({}, () => service.create(DASH_ID, { expiresAt: future }));
    expect(prisma.linkStore[0]?.expiresAt?.toISOString()).toBe(future.toISOString());
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tests: list
// ────────────────────────────────────────────────────────────────────────────

describe('ShareLinksService.list', () => {
  test('returns links for the dashboard newest-first', async () => {
    const prisma = new FakePrisma();
    const now = Date.now();
    prisma.linkStore.push(
      {
        id: 'link_old',
        organizationId: ORG,
        dashboardId: DASH_ID,
        token: 'tok_old',
        expiresAt: null,
        viewCount: 0,
        passwordHash: null,
        lastViewedAt: null,
        revokedAt: null,
        createdAt: new Date(now - 10_000),
        createdById: 'u1',
      },
      {
        id: 'link_new',
        organizationId: ORG,
        dashboardId: DASH_ID,
        token: 'tok_new',
        expiresAt: null,
        viewCount: 5,
        passwordHash: null,
        lastViewedAt: null,
        revokedAt: null,
        createdAt: new Date(now),
        createdById: 'u1',
      },
    );
    const { service } = makeService({ prisma });
    const result = await withCtx({}, () => service.list(DASH_ID));
    expect(result[0]!.id).toBe('link_new');
    expect(result[1]!.id).toBe('link_old');
  });

  test('never exposes passwordHash — only hasPassword boolean', async () => {
    const prisma = new FakePrisma();
    prisma.linkStore.push({
      id: 'link_pw',
      organizationId: ORG,
      dashboardId: DASH_ID,
      token: 'tok_pw',
      expiresAt: null,
      viewCount: 0,
      passwordHash: 'hashed:something',
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
    });
    const { service } = makeService({ prisma });
    const result = await withCtx({}, () => service.list(DASH_ID));
    expect(result[0]).not.toHaveProperty('passwordHash');
    expect(result[0]!.hasPassword).toBe(true);
  });

  test('hasPassword is false when no password hash stored', async () => {
    const prisma = new FakePrisma();
    prisma.linkStore.push({
      id: 'link_nopw',
      organizationId: ORG,
      dashboardId: DASH_ID,
      token: 'tok_nopw',
      expiresAt: null,
      viewCount: 0,
      passwordHash: null,
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
    });
    const { service } = makeService({ prisma });
    const result = await withCtx({}, () => service.list(DASH_ID));
    expect(result[0]!.hasPassword).toBe(false);
  });

  test('throws 404 when dashboard is not visible', async () => {
    const dashboardStub = makeDashboardStub({ throws: true });
    const { service } = makeService({ dashboardStub });
    await expect(
      withCtx({}, () => service.list('invisible')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('does not return links from another org', async () => {
    const prisma = new FakePrisma();
    prisma.linkStore.push({
      id: 'link_other',
      organizationId: 'other_org',
      dashboardId: DASH_ID,
      token: 'tok_other',
      expiresAt: null,
      viewCount: 0,
      passwordHash: null,
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
    });
    const { service } = makeService({ prisma });
    const result = await withCtx({ organizationId: ORG }, () => service.list(DASH_ID));
    expect(result).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tests: revoke
// ────────────────────────────────────────────────────────────────────────────

describe('ShareLinksService.revoke', () => {
  test('sets revokedAt on the link', async () => {
    const prisma = new FakePrisma();
    prisma.linkStore.push({
      id: 'link_rev',
      organizationId: ORG,
      dashboardId: DASH_ID,
      token: 'tok_rev',
      expiresAt: null,
      viewCount: 0,
      passwordHash: null,
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
    });
    const { service } = makeService({ prisma });
    await withCtx({}, () => service.revoke('link_rev'));
    expect(prisma.linkStore[0]?.revokedAt).toBeInstanceOf(Date);
  });

  test('is org-scoped — cross-org linkId → 404', async () => {
    const prisma = new FakePrisma();
    prisma.linkStore.push({
      id: 'link_xorg',
      organizationId: 'other_org',
      dashboardId: DASH_ID,
      token: 'tok_xorg',
      expiresAt: null,
      viewCount: 0,
      passwordHash: null,
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
    });
    const { service } = makeService({ prisma });
    await expect(
      withCtx({ organizationId: ORG }, () => service.revoke('link_xorg')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('throws 404 for a non-existent link', async () => {
    const { service } = makeService();
    await expect(
      withCtx({}, () => service.revoke('does_not_exist')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('records an audit entry', async () => {
    const prisma = new FakePrisma();
    prisma.linkStore.push({
      id: 'link_audit',
      organizationId: ORG,
      dashboardId: DASH_ID,
      token: 'tok_audit',
      expiresAt: null,
      viewCount: 0,
      passwordHash: null,
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
    });
    const { service, audit } = makeService({ prisma });
    await withCtx({}, () => service.revoke('link_audit'));
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({
      action: 'UPDATE',
      entityType: 'DashboardShareLink',
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Tests: resolve
// ────────────────────────────────────────────────────────────────────────────

describe('ShareLinksService.resolve', () => {
  /** Seed a share link and a dashboard in the fake prisma. */
  function seedValidLink(
    prisma: FakePrisma,
    overrides: Partial<FakeLink> = {},
  ): FakeLink {
    const link: FakeLink = {
      id: 'link_resolve',
      organizationId: ORG,
      dashboardId: DASH_ID,
      token: 'valid_token',
      expiresAt: null,
      viewCount: 0,
      passwordHash: null,
      lastViewedAt: null,
      revokedAt: null,
      createdAt: new Date(),
      createdById: 'u1',
      ...overrides,
    };
    prisma.linkStore.push(link);

    prisma.dashboardStore.push({
      id: DASH_ID,
      organizationId: ORG,
      name: 'Shared Dashboard',
      description: 'A great dashboard',
      isShared: true,
      layout: null,
      version: 2,
      deletedAt: null,
      widgets: [],
    });

    // The link creator must exist for resolveCreatorLimits to resolve their
    // allowlist + window (a missing creator fails closed). Default role ⇒ null.
    if (!prisma.userStore.some((u) => u.id === link.createdById)) {
      prisma.userStore.push({
        id: link.createdById,
        organizationId: link.organizationId,
        roleId: null,
      });
    }

    return link;
  }

  test('runs under runWithBypass — works without a RequestContextStore.run() wrapper', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma);
    const { service } = makeService({ prisma });
    // Intentionally NOT wrapping in withCtx / RequestContextStore.run().
    const result = await service.resolve('valid_token');
    expect(result.dashboard.id).toBe(DASH_ID);
  });

  test('valid token returns composed dashboard + widgets + kpiValues', async () => {
    const prisma = new FakePrisma();
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: 'kpi_1',
      value: 88,
      recordedAt: new Date(),
    });
    const link = seedValidLink(prisma);
    // Add a widget that references kpi_1.
    prisma.dashboardStore[0]!.widgets = [
      {
        id: 'w1',
        widgetType: 'kpi_card',
        title: 'KPI',
        config: { kpiId: 'kpi_1' },
        position: { x: 0, y: 0, w: 4, h: 2 },
        sortOrder: 0,
      },
    ];

    const { service } = makeService({ prisma });
    const result = await service.resolve(link.token);
    expect(result.dashboard.name).toBe('Shared Dashboard');
    expect(result.widgets).toHaveLength(1);
    expect(result.kpiValues['kpi_1']).toMatchObject({ latestValue: 88 });
  });

  test('increments viewCount on success', async () => {
    const prisma = new FakePrisma();
    const link = seedValidLink(prisma, { viewCount: 3 });
    const { service } = makeService({ prisma });
    await service.resolve(link.token);
    const stored = prisma.linkStore.find((l) => l.id === link.id);
    expect(stored?.viewCount).toBe(4);
  });

  test('sets lastViewedAt on success', async () => {
    const prisma = new FakePrisma();
    const link = seedValidLink(prisma);
    expect(link.lastViewedAt).toBeNull();
    const { service } = makeService({ prisma });
    await service.resolve(link.token);
    const stored = prisma.linkStore.find((l) => l.id === link.id);
    expect(stored?.lastViewedAt).toBeInstanceOf(Date);
  });

  test('revoked link → 404 (does not leak existence)', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { revokedAt: new Date() });
    const { service } = makeService({ prisma });
    await expect(service.resolve('valid_token')).rejects.toBeInstanceOf(NotFoundException);
  });

  test('expired link → 410 GoneException', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { expiresAt: new Date(Date.now() - 1000) });
    const { service } = makeService({ prisma });
    await expect(service.resolve('valid_token')).rejects.toBeInstanceOf(GoneException);
  });

  test('non-existent token → 404', async () => {
    const { service } = makeService();
    await expect(service.resolve('ghost_token')).rejects.toBeInstanceOf(NotFoundException);
  });

  test('password-protected link: missing password → 401', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { passwordHash: 'hashed:secret' });
    const { service } = makeService({ prisma });
    await expect(service.resolve('valid_token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('password-protected link: wrong password → 401', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { passwordHash: 'hashed:secret' });
    const { service } = makeService({ prisma });
    await expect(
      service.resolve('valid_token', 'wrongpassword'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('password-protected link: correct password → success + viewCount incremented', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { passwordHash: 'hashed:secret', viewCount: 0 });
    const { service } = makeService({ prisma });
    const result = await service.resolve('valid_token', 'secret');
    expect(result.dashboard.id).toBe(DASH_ID);
    const stored = prisma.linkStore.find((l) => l.token === 'valid_token');
    expect(stored?.viewCount).toBe(1);
  });

  test('future expiresAt is valid — does not throw', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { expiresAt: new Date(Date.now() + 3_600_000) });
    const { service } = makeService({ prisma });
    await expect(service.resolve('valid_token')).resolves.toBeDefined();
  });

  test('password-protected link: missing password → 401 with code PASSWORD_REQUIRED', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { passwordHash: 'hashed:secret' });
    const { service } = makeService({ prisma });
    await expect(service.resolve('valid_token')).rejects.toMatchObject({
      response: { code: 'PASSWORD_REQUIRED' },
    });
  });

  test('password-protected link: wrong password → 401 with code INVALID_PASSWORD', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { passwordHash: 'hashed:secret' });
    const { service } = makeService({ prisma });
    await expect(service.resolve('valid_token', 'wrongpassword')).rejects.toMatchObject({
      response: { code: 'INVALID_PASSWORD' },
    });
  });

  test('password-protected link: correct password → resolve() result does NOT contain passwordHash or token', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma, { passwordHash: 'hashed:secret', viewCount: 0 });
    const { service } = makeService({ prisma });
    const result = await service.resolve('valid_token', 'secret');
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('token');
    expect(result.dashboard.id).toBe(DASH_ID);
  });

  // -------------------------------------------------------------------------
  // Layer-3 category allowlist (Phase 3 security): the public payload is gated
  // by the LINK CREATOR's KPI category allowlist.
  // -------------------------------------------------------------------------

  /** Seed a link + dashboard with two KPI widgets (cat_a allowed, cat_b restricted). */
  function seedTwoCategoryLink(prisma: FakePrisma): void {
    seedValidLink(prisma);
    prisma.dashboardStore[0]!.widgets = [
      {
        id: 'w_allowed',
        widgetType: 'kpi_card',
        title: 'Allowed',
        config: { kpiId: 'kpi_allowed' },
        position: { x: 0, y: 0, w: 4, h: 2 },
        sortOrder: 0,
      },
      {
        id: 'w_restricted',
        widgetType: 'kpi_card',
        title: 'Restricted',
        config: { kpiId: 'kpi_restricted' },
        position: { x: 4, y: 0, w: 4, h: 2 },
        sortOrder: 1,
      },
    ];
    prisma.kpiStore.push(
      { organizationId: ORG, id: 'kpi_allowed', categoryId: 'cat_a' },
      { organizationId: ORG, id: 'kpi_restricted', categoryId: 'cat_b' },
    );
    prisma.dataPointStore.push(
      { organizationId: ORG, kpiId: 'kpi_allowed', value: 10, recordedAt: new Date('2026-01-01') },
      { organizationId: ORG, kpiId: 'kpi_restricted', value: 999, recordedAt: new Date('2026-01-02') },
    );
  }

  test('restricted-category KPI value is omitted from the public payload (leak closed)', async () => {
    const prisma = new FakePrisma();
    seedTwoCategoryLink(prisma);
    const accessContext = new FakeAccessContext();
    // The creator (u1) may only see cat_a; cat_b (kpi_restricted) is off-limits.
    accessContext.allowlistByUser.set('u1', ['cat_a']);
    const { service } = makeService({ prisma, accessContext });

    const result = await service.resolve('valid_token');

    expect(result.kpiValues['kpi_allowed']).toMatchObject({ latestValue: 10 });
    // The restricted KPI's value must never reach the public share output.
    expect(result.kpiValues['kpi_restricted']).toBeUndefined();
    // The allowlist was resolved under the creator's context, not the bypass principal.
    expect(accessContext.kpiCategoryAllowlist).toHaveBeenCalled();
  });

  test('null creator allowlist ⇒ all values present (parity)', async () => {
    const prisma = new FakePrisma();
    seedTwoCategoryLink(prisma);
    const accessContext = new FakeAccessContext();
    // Creator u1 has no category restriction (null) — parity with pre-fix behaviour.
    accessContext.allowlistByUser.set('u1', null);
    const { service } = makeService({ prisma, accessContext });

    const result = await service.resolve('valid_token');

    expect(result.kpiValues['kpi_allowed']).toMatchObject({ latestValue: 10 });
    expect(result.kpiValues['kpi_restricted']).toMatchObject({ latestValue: 999 });
    // Parity: a null allowlist short-circuits the per-KPI category lookup.
    expect(prisma.kPI.findFirst).not.toHaveBeenCalled();
  });

  test('a null-category KPI is hidden when the creator has an allowlist', async () => {
    const prisma = new FakePrisma();
    seedValidLink(prisma);
    prisma.dashboardStore[0]!.widgets = [
      {
        id: 'w_uncat',
        widgetType: 'kpi_card',
        title: 'Uncategorized',
        config: { kpiId: 'kpi_uncategorized' },
        position: { x: 0, y: 0, w: 4, h: 2 },
        sortOrder: 0,
      },
    ];
    prisma.kpiStore.push({ organizationId: ORG, id: 'kpi_uncategorized', categoryId: null });
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: 'kpi_uncategorized',
      value: 7,
      recordedAt: new Date('2026-01-01'),
    });
    const accessContext = new FakeAccessContext();
    accessContext.allowlistByUser.set('u1', ['cat_a']);
    const { service } = makeService({ prisma, accessContext });

    const result = await service.resolve('valid_token');
    expect(result.kpiValues['kpi_uncategorized']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Layer-4 data limit (Phase 4): the public payload's latest-point read is
  // bounded by the LINK CREATOR's historyWindowDays.
  // -------------------------------------------------------------------------

  /** Seed a link + dashboard with one KPI widget whose only point is `ageDays` old. */
  function seedSingleKpiLink(prisma: FakePrisma, ageDays: number): void {
    seedValidLink(prisma);
    prisma.dashboardStore[0]!.widgets = [
      {
        id: 'w1',
        widgetType: 'kpi_card',
        title: 'KPI 1',
        config: { kpiId: 'kpi_1' },
        position: { x: 0, y: 0, w: 4, h: 2 },
        sortOrder: 0,
      },
    ];
    prisma.dataPointStore.push({
      organizationId: ORG,
      kpiId: 'kpi_1',
      value: 42,
      recordedAt: new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000),
    });
  }

  test("window set ⇒ a point older than the creator's window is omitted from the public payload", async () => {
    const prisma = new FakePrisma();
    seedSingleKpiLink(prisma, 30); // 30-day-old point
    const accessContext = new FakeAccessContext();
    // The creator (u1) has a 7-day window — the 30-day-old point is out of range.
    accessContext.historyWindowByUser.set('u1', 7);
    const { service } = makeService({ prisma, accessContext });

    const result = await service.resolve('valid_token');

    expect(result.kpiValues['kpi_1']).toMatchObject({ latestValue: null });
    // The window was resolved under the creator's context, not the bypass principal.
    expect(accessContext.dataLimits).toHaveBeenCalled();
  });

  test('null creator window ⇒ old point still present in the public payload (parity)', async () => {
    const prisma = new FakePrisma();
    seedSingleKpiLink(prisma, 30); // 30-day-old point
    const accessContext = new FakeAccessContext();
    accessContext.historyWindowByUser.set('u1', null); // parity — unbounded window
    const { service } = makeService({ prisma, accessContext });

    const result = await service.resolve('valid_token');

    expect(result.kpiValues['kpi_1']).toMatchObject({ latestValue: 42 });
    // Latest = newest period, not newest entry (AN-002).
    expect(prisma.kPIDataPoint.findFirst.mock.calls[0]![0]).toMatchObject({ orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }] });
  });

  test("window set ⇒ a point within the creator's window is still present", async () => {
    const prisma = new FakePrisma();
    seedSingleKpiLink(prisma, 1); // 1-day-old point
    const accessContext = new FakeAccessContext();
    accessContext.historyWindowByUser.set('u1', 7);
    const { service } = makeService({ prisma, accessContext });

    const result = await service.resolve('valid_token');

    expect(result.kpiValues['kpi_1']).toMatchObject({ latestValue: 42 });
  });
});
