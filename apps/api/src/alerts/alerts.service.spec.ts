/**
 * AlertsService unit tests (Phase 2.5). In-memory Prisma fake + no-op audit +
 * fake AccessContext. Covers the always-on KPI-visibility floor and the
 * ALERTS-scope targetUserId narrowing on list / getById / unreadCount.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Scope } from '@kpi-nexus/contracts';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { AlertsService } from './alerts.service.js';

const ORG = 'org_alpha';

interface FakeAlert {
  id: string;
  organizationId: string;
  alertRuleId: string | null;
  kpiId: string | null;
  message: string;
  severity: string;
  status: string;
  targetUserId: string | null;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  resolvedAt: Date | null;
  meta: unknown;
  createdAt: Date;
}

function mkAlert(over: Partial<FakeAlert> = {}): FakeAlert {
  return {
    id: 'a_x', organizationId: ORG, alertRuleId: null, kpiId: 'k1', message: 'm',
    severity: 'LOW', status: 'OPEN', targetUserId: null, acknowledgedAt: null,
    acknowledgedById: null, resolvedAt: null, meta: null, createdAt: new Date(),
    ...over,
  };
}

function matchAlert(a: FakeAlert, where: Record<string, unknown>): boolean {
  if (where.organizationId && a.organizationId !== where.organizationId) return false;
  if (where.id && a.id !== where.id) return false;
  if (where.status && a.status !== where.status) return false;
  if (where.severity && a.severity !== where.severity) return false;
  if (where.kpiId !== undefined) {
    const c = where.kpiId;
    if (c && typeof c === 'object' && 'in' in (c as Record<string, unknown>)) {
      if (!(c as { in: string[] }).in.includes(a.kpiId ?? '')) return false;
    } else if (a.kpiId !== c) return false;
  }
  if (where.targetUserId !== undefined) {
    const c = where.targetUserId;
    if (c === null) {
      if (a.targetUserId !== null) return false;
    } else if (c && typeof c === 'object' && 'in' in (c as Record<string, unknown>)) {
      if (!(c as { in: string[] }).in.includes(a.targetUserId ?? '')) return false;
    } else if (a.targetUserId !== c) return false;
  }
  if (Array.isArray(where.OR)) {
    if (!(where.OR as Array<Record<string, unknown>>).some((b) => matchAlert(a, b))) return false;
  }
  return true;
}

class FakePrisma {
  alerts: FakeAlert[] = [];
  alert = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.alerts.filter((a) => matchAlert(a, where)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.alerts.find((a) => matchAlert(a, where)) ?? null,
    ),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.alerts.filter((a) => matchAlert(a, where)).length,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      let n = 0;
      for (const a of this.alerts) if (matchAlert(a, where)) { Object.assign(a, data); n++; }
      return { count: n };
    }),
  };
  kPI = { findMany: vi.fn(async () => [] as Array<{ id: string }>) };
}

class FakeAudit {
  record = vi.fn(async () => {});
}

class FakeAccessContext {
  isAdmin = false;
  alertsScope: Scope = 'ORG';
  kpisScope: Scope = 'UNITS';
  directReportIds: string[] = [];
  unitMemberIds: string[] = [];
  resolveForCurrentPrincipal = vi.fn(async () => ({
    isAdmin: this.isAdmin,
    capabilities: [],
    scopeByDomain: { ALERTS: this.alertsScope, KPIS: this.kpisScope },
    dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
    dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
    context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: this.directReportIds },
  }));
  unitMemberUserIds = vi.fn(async () => this.unitMemberIds);
}

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: ctx.userId ?? 'u1', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService(
  opts: { isAdmin?: boolean; alertsScope?: Scope; directReportIds?: string[]; unitMemberIds?: string[] } = {},
) {
  const prisma = new FakePrisma();
  const accessContext = new FakeAccessContext();
  accessContext.isAdmin = opts.isAdmin ?? false;
  if (opts.alertsScope) accessContext.alertsScope = opts.alertsScope;
  if (opts.directReportIds) accessContext.directReportIds = opts.directReportIds;
  if (opts.unitMemberIds) accessContext.unitMemberIds = opts.unitMemberIds;
  const service = new AlertsService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, accessContext };
}

describe('AlertsService visibility (Phase 2.5)', () => {
  test('non-admin ORG ⇒ kpiId limited to visible KPIs (floor), no target narrowing', async () => {
    const { service, prisma } = makeService();
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }, { id: 'k2' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.kpiId).toEqual({ in: ['k1', 'k2'] });
    expect(where.targetUserId).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  test('SELF ⇒ targetUserId IN {me} AND the KPI floor', async () => {
    const { service, prisma } = makeService({ alertsScope: 'SELF' });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.kpiId).toEqual({ in: ['k1'] });
    expect(where.targetUserId).toEqual({ in: ['me'] });
  });

  test('UNITS ⇒ targetUserId IN {me,peers} OR untargeted (null)', async () => {
    const { service, prisma } = makeService({ alertsScope: 'UNITS', unitMemberIds: ['peer1'] });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.OR).toEqual([
      { targetUserId: { in: expect.arrayContaining(['me', 'peer1']) } },
      { targetUserId: null },
    ]);
  });

  test('admin ⇒ no floor, no target filter, KPI set not queried', async () => {
    const { service, prisma } = makeService({ isAdmin: true });
    await withCtx({ userId: 'admin' }, () => service.list());
    const where = prisma.alert.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.kpiId).toBeUndefined();
    expect(where.targetUserId).toBeUndefined();
    expect(prisma.kPI.findMany).not.toHaveBeenCalled();
  });

  test('getById ⇒ 404 when the alert’s KPI is not in the visible set', async () => {
    const { service, prisma } = makeService();
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]); // only k1 visible
    prisma.alerts.push(mkAlert({ id: 'a1', kpiId: 'k2', targetUserId: null }));
    await expect(withCtx({ userId: 'me' }, () => service.getById('a1'))).rejects.toBeInstanceOf(NotFoundException);
  });

  test('getById ⇒ visible when the alert’s KPI is in the visible set', async () => {
    const { service, prisma } = makeService();
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    prisma.alerts.push(mkAlert({ id: 'a1', kpiId: 'k1', targetUserId: null }));
    const got = await withCtx({ userId: 'me' }, () => service.getById('a1'));
    expect(got.id).toBe('a1');
  });

  test('admin getById ⇒ no floor (sees an alert for any KPI)', async () => {
    const { service, prisma } = makeService({ isAdmin: true });
    prisma.alerts.push(mkAlert({ id: 'a1', kpiId: 'kX', targetUserId: 'someone' }));
    const got = await withCtx({ userId: 'admin' }, () => service.getById('a1'));
    expect(got.id).toBe('a1');
  });

  test('unreadCount applies the KPI floor', async () => {
    const { service, prisma } = makeService();
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    prisma.alerts.push(
      mkAlert({ id: 'a1', kpiId: 'k1', status: 'OPEN', targetUserId: null }),
      mkAlert({ id: 'a2', kpiId: 'kX', status: 'OPEN', targetUserId: null }),
    );
    const n = await withCtx({ userId: 'me' }, () => service.unreadCount());
    expect(n).toBe(1);
  });
});

describe('AlertsService.isVisible (realtime stream filter)', () => {
  const alert = (over: Partial<FakeAlert> = {}): FakeAlert =>
    ({ id: 'a1', organizationId: ORG, alertRuleId: null, kpiId: 'k1', message: 'm', severity: 'HIGH', status: 'OPEN', targetUserId: null, ...over }) as FakeAlert;

  test('true when the same rule as getById lets the caller see the alert, false otherwise (no throw)', async () => {
    const { service, prisma } = makeService({ alertsScope: 'SELF' });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    prisma.alerts = [alert({ id: 'mine', targetUserId: 'me' }), alert({ id: 'theirs', targetUserId: 'other' }), alert({ id: 'hidden-kpi', kpiId: 'k9', targetUserId: 'me' })];
    await expect(withCtx({ userId: 'me' }, () => service.isVisible('mine'))).resolves.toBe(true);
    await expect(withCtx({ userId: 'me' }, () => service.isVisible('theirs'))).resolves.toBe(false);
    await expect(withCtx({ userId: 'me' }, () => service.isVisible('hidden-kpi'))).resolves.toBe(false);
  });
});
