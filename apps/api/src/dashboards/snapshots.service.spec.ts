/**
 * P3.3 — SnapshotService unit tests.
 *
 * Pure unit. Prisma is replaced with an in-memory fake; AuditService is a
 * no-op spy; DashboardsService is a controllable stub. Tests cover:
 *
 *   - capture composes payload with kpiValues keyed by kpiId from widget configs
 *   - capture throws 404 for a missing / other-org dashboard
 *   - list returns newest-first and 404s on invisible dashboard
 *   - get / delete are org-scoped (404 on cross-org)
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';
import type { DashboardsService, PublicDashboard } from './dashboards.service.js';
import { SnapshotService } from './snapshots.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG = 'org_snap_test';

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

// ---------------------------------------------------------------------------
// Fake types
// ---------------------------------------------------------------------------

interface FakeSnapshotTakenBy {
  id: string;
  fullName: string;
  email: string;
}

interface FakeSnapshot {
  id: string;
  organizationId: string;
  dashboardId: string;
  label: string | null;
  payload: unknown;
  takenById: string;
  takenBy: FakeSnapshotTakenBy;
  takenAt: Date;
}

interface FakeDataPoint {
  organizationId: string;
  kpiId: string;
  value: number;
  recordedAt: Date;
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakePrisma {
  private nextId = 1;
  snapshotStore: FakeSnapshot[] = [];
  dataPointStore: FakeDataPoint[] = [];

  dashboardSnapshot = {
    create: vi.fn(async ({ data }: { data: Partial<FakeSnapshot> }) => {
      const row: FakeSnapshot = {
        id: `snap_${this.nextId++}`,
        organizationId: data.organizationId!,
        dashboardId: data.dashboardId!,
        label: data.label ?? null,
        payload: data.payload ?? {},
        takenById: data.takenById!,
        takenBy: { id: data.takenById!, fullName: 'Test User', email: 'test@example.com' },
        takenAt: new Date(),
      };
      this.snapshotStore.push(row);
      return { ...row };
    }),
    findMany: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) => {
        return this.snapshotStore
          .filter((s) => this.matchSnap(s, where))
          .sort((a, b) => b.takenAt.getTime() - a.takenAt.getTime())
          .map((s) => ({ ...s }));
      },
    ),
    findFirst: vi.fn(
      async ({ where }: { where: Record<string, unknown> }) => {
        const s = this.snapshotStore.find((s) => this.matchSnap(s, where));
        return s ? { ...s } : null;
      },
    ),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const idx = this.snapshotStore.findIndex((s) => s.id === where.id);
      if (idx !== -1) this.snapshotStore.splice(idx, 1);
    }),
  };

  kPIDataPoint = {
    findFirst: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId: string; kpiId: string };
        orderBy?: unknown;
        select?: unknown;
      }) => {
        const dp = this.dataPointStore.find(
          (d) =>
            d.organizationId === where.organizationId &&
            d.kpiId === where.kpiId,
        );
        return dp ? { value: dp.value, recordedAt: dp.recordedAt } : null;
      },
    ),
  };

  private matchSnap(s: FakeSnapshot, where: Record<string, unknown>): boolean {
    if (where.id && s.id !== where.id) return false;
    if (where.organizationId && s.organizationId !== where.organizationId)
      return false;
    if (where.dashboardId && s.dashboardId !== where.dashboardId) return false;
    return true;
  }
}

class FakeAudit {
  records: Array<Record<string, unknown>> = [];
  record = vi.fn(async (input: Record<string, unknown>) => {
    this.records.push(input);
  });
}

// A stub for DashboardsService. `getById` can be configured to throw or return a dashboard.
function makeDashboardStub(
  opts: { throws?: boolean; dashboard?: Partial<PublicDashboard> } = {},
): DashboardsService {
  const base: PublicDashboard = {
    id: 'dash_1',
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
    // These are unused in SnapshotService but required to satisfy the type.
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    setDefault: vi.fn(),
  } as unknown as DashboardsService;
}

function makeService(opts: {
  dashboardStub?: DashboardsService;
  prisma?: FakePrisma;
} = {}): { service: SnapshotService; prisma: FakePrisma; audit: FakeAudit } {
  const prisma = opts.prisma ?? new FakePrisma();
  const audit = new FakeAudit();
  const dashboards = opts.dashboardStub ?? makeDashboardStub();
  const service = new SnapshotService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    dashboards,
  );
  return { service, prisma, audit };
}

// ---------------------------------------------------------------------------
// Tests: capture
// ---------------------------------------------------------------------------

describe('SnapshotService.capture', () => {
  test('composes payload with kpiValues keyed by kpiId from widget configs', async () => {
    const prisma = new FakePrisma();
    prisma.dataPointStore.push(
      {
        organizationId: ORG,
        kpiId: 'kpi_1',
        value: 42,
        recordedAt: new Date('2026-01-01'),
      },
      {
        organizationId: ORG,
        kpiId: 'kpi_2',
        value: 99,
        recordedAt: new Date('2026-01-02'),
      },
    );

    const dashboardStub = makeDashboardStub({
      dashboard: {
        id: 'dash_1',
        widgets: [
          {
            id: 'w1',
            widgetType: 'kpi_card',
            title: 'KPI 1',
            config: { kpiId: 'kpi_1' },
            position: { x: 0, y: 0, w: 4, h: 2 },
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'w2',
            widgetType: 'line',
            title: 'KPI 2',
            config: { kpiId: 'kpi_2' },
            position: { x: 4, y: 0, w: 4, h: 2 },
            sortOrder: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          // Widget with no kpiId — should not appear in kpiValues.
          {
            id: 'w3',
            widgetType: 'activity',
            title: 'Activity',
            config: {},
            position: { x: 8, y: 0, w: 4, h: 2 },
            sortOrder: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as PublicDashboard['widgets'],
      },
    });

    const { service } = makeService({ dashboardStub, prisma });

    const snapshot = await withCtx({}, () =>
      service.capture('dash_1', { label: 'my label' }),
    );

    expect(snapshot.dashboardId).toBe('dash_1');

    // The payload is a Prisma Json — cast to our interface for assertions.
    const payload = snapshot.payload as unknown as import('./snapshots.service.js').SnapshotPayload;
    expect(Object.keys(payload.kpiValues)).toHaveLength(2);
    expect(payload.kpiValues['kpi_1']).toMatchObject({ latestValue: 42 });
    expect(payload.kpiValues['kpi_2']).toMatchObject({ latestValue: 99 });
    // Widget without kpiId must not appear.
    expect(payload.kpiValues['undefined']).toBeUndefined();
    expect(payload.widgets).toHaveLength(3);
    expect(payload.dashboard.name).toBe('Test Dashboard');
  });

  test('capture sets takenById from request context userId', async () => {
    const { service, prisma } = makeService();
    await withCtx({ userId: 'user_42' }, () =>
      service.capture('dash_1', {}),
    );
    expect(prisma.snapshotStore[0]?.takenById).toBe('user_42');
  });

  test('capture records an audit entry', async () => {
    const { service, audit } = makeService();
    await withCtx({}, () => service.capture('dash_1', { label: 'snap' }));
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({
      action: 'CREATE',
      entityType: 'DashboardSnapshot',
    });
  });

  test('capture throws 404 when dashboard is not visible / not found', async () => {
    const dashboardStub = makeDashboardStub({ throws: true });
    const { service } = makeService({ dashboardStub });
    await expect(
      withCtx({}, () => service.capture('missing_dash', {})),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('kpiValues entry has null latestValue when no data point exists', async () => {
    const dashboardStub = makeDashboardStub({
      dashboard: {
        widgets: [
          {
            id: 'w1',
            widgetType: 'kpi_card',
            title: null,
            config: { kpiId: 'kpi_no_data' },
            position: { x: 0, y: 0, w: 4, h: 2 },
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as PublicDashboard['widgets'],
      },
    });
    const { service } = makeService({ dashboardStub });
    const snapshot = await withCtx({}, () => service.capture('dash_1', {}));
    const payload = snapshot.payload as unknown as import('./snapshots.service.js').SnapshotPayload;
    expect(payload.kpiValues['kpi_no_data']).toMatchObject({ latestValue: null });
  });
});

// ---------------------------------------------------------------------------
// Tests: list
// ---------------------------------------------------------------------------

describe('SnapshotService.list', () => {
  test('returns snapshots newest-first', async () => {
    const prisma = new FakePrisma();
    const now = Date.now();
    prisma.snapshotStore.push(
      {
        id: 'snap_old',
        organizationId: ORG,
        dashboardId: 'dash_1',
        label: 'old',
        payload: {},
        takenById: 'u1',
        takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
        takenAt: new Date(now - 10_000),
      },
      {
        id: 'snap_new',
        organizationId: ORG,
        dashboardId: 'dash_1',
        label: 'new',
        payload: {},
        takenById: 'u1',
        takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
        takenAt: new Date(now),
      },
    );
    const { service } = makeService({ prisma });
    const result = await withCtx({}, () => service.list('dash_1'));
    expect(result[0]!.id).toBe('snap_new');
    expect(result[1]!.id).toBe('snap_old');
    // takenBy should be resolved, not just the raw FK
    expect(result[0]!.takenBy).toMatchObject({ id: 'u1', fullName: 'Test User', email: 'test@example.com' });
  });

  test('returns 404 when the dashboard is not visible', async () => {
    const dashboardStub = makeDashboardStub({ throws: true });
    const { service } = makeService({ dashboardStub });
    await expect(
      withCtx({}, () => service.list('invisible_dash')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('does not return snapshots from a different org', async () => {
    const prisma = new FakePrisma();
    prisma.snapshotStore.push({
      id: 'snap_other',
      organizationId: 'org_other',
      dashboardId: 'dash_1',
      label: null,
      payload: {},
      takenById: 'u1',
      takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
      takenAt: new Date(),
    });
    const { service } = makeService({ prisma });
    const result = await withCtx({ organizationId: ORG }, () =>
      service.list('dash_1'),
    );
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: get
// ---------------------------------------------------------------------------

describe('SnapshotService.get', () => {
  test('returns a snapshot by id within the org', async () => {
    const prisma = new FakePrisma();
    prisma.snapshotStore.push({
      id: 'snap_1',
      organizationId: ORG,
      dashboardId: 'dash_1',
      label: 'test',
      payload: { capturedAt: '2026-01-01' },
      takenById: 'u1',
      takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
      takenAt: new Date(),
    });
    const { service } = makeService({ prisma });
    const result = await withCtx({}, () => service.get('snap_1'));
    expect(result.id).toBe('snap_1');
  });

  test('throws 404 for a cross-org snapshot id', async () => {
    const prisma = new FakePrisma();
    prisma.snapshotStore.push({
      id: 'snap_other',
      organizationId: 'org_other',
      dashboardId: 'dash_1',
      label: null,
      payload: {},
      takenById: 'u1',
      takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
      takenAt: new Date(),
    });
    const { service } = makeService({ prisma });
    await expect(
      withCtx({ organizationId: ORG }, () => service.get('snap_other')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('throws 404 for a non-existent snapshot id', async () => {
    const { service } = makeService();
    await expect(
      withCtx({}, () => service.get('does_not_exist')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// Tests: delete
// ---------------------------------------------------------------------------

describe('SnapshotService.delete', () => {
  test('hard-deletes a snapshot and records audit', async () => {
    const prisma = new FakePrisma();
    prisma.snapshotStore.push({
      id: 'snap_del',
      organizationId: ORG,
      dashboardId: 'dash_1',
      label: null,
      payload: {},
      takenById: 'u1',
      takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
      takenAt: new Date(),
    });
    const { service, audit } = makeService({ prisma });
    await withCtx({}, () => service.delete('snap_del'));
    expect(prisma.snapshotStore).toHaveLength(0);
    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]).toMatchObject({
      action: 'DELETE',
      entityType: 'DashboardSnapshot',
    });
  });

  test('throws 404 when deleting a cross-org snapshot', async () => {
    const prisma = new FakePrisma();
    prisma.snapshotStore.push({
      id: 'snap_other',
      organizationId: 'org_other',
      dashboardId: 'dash_1',
      label: null,
      payload: {},
      takenById: 'u1',
      takenBy: { id: 'u1', fullName: 'Test User', email: 'test@example.com' },
      takenAt: new Date(),
    });
    const { service } = makeService({ prisma });
    await expect(
      withCtx({ organizationId: ORG }, () => service.delete('snap_other')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  test('throws 404 when snapshot does not exist', async () => {
    const { service } = makeService();
    await expect(
      withCtx({}, () => service.delete('ghost')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
