/**
 * AlertRulesService unit tests. In-memory Prisma fake + no-op audit.
 * Covers: create (happy + KPI-tenant guard + empty-escalation-level drop),
 * org-scoped list/get, escalation upsert/clear on update, delete.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import type { Scope } from '@kpi-nexus/contracts';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { AlertRulesService } from './alert-rules.service.js';
import type { CreateAlertRuleDto } from './dto/alert-rule.dto.js';

interface FakeRule {
  id: string;
  organizationId: string;
  kpiId: string;
  name: string;
  description: string | null;
  ruleType: string;
  config: unknown;
  severity: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById: string;
}

interface FakeEsc {
  id: string;
  organizationId: string;
  alertRuleId: string;
  levels: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function matchRule(r: FakeRule, where: Record<string, unknown>): boolean {
  if (where.organizationId && r.organizationId !== where.organizationId) return false;
  if (where.id && r.id !== where.id) return false;
  if (where.kpiId !== undefined) {
    const c = where.kpiId;
    if (c && typeof c === 'object' && 'in' in (c as Record<string, unknown>)) {
      if (!(c as { in: string[] }).in.includes(r.kpiId)) return false;
    } else if (r.kpiId !== c) return false;
  }
  if (where.createdById !== undefined) {
    const c = where.createdById;
    if (c && typeof c === 'object' && 'in' in (c as Record<string, unknown>)) {
      if (!(c as { in: string[] }).in.includes(r.createdById)) return false;
    } else if (r.createdById !== c) return false;
  }
  return true;
}

class FakePrisma {
  private n = 1;
  rules: FakeRule[] = [];
  escs: FakeEsc[] = [];
  kpis: { id: string; organizationId: string }[] = [];

  kPI = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.kpis.find((k) => k.id === where.id && k.organizationId === where.organizationId) ?? null,
    ),
    findMany: vi.fn(async () => this.kpis.map((k) => ({ id: k.id }))),
  };

  alertRule = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.rules.filter((r) => matchRule(r, where)).map((r) => this.materialize(r)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const r = this.rules.find((r) => matchRule(r, where));
      return r ? this.materialize(r) : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const r: FakeRule = {
        id: `rule_${this.n++}`,
        organizationId: data.organizationId as string,
        kpiId: data.kpiId as string,
        name: data.name as string,
        description: (data.description as string) ?? null,
        ruleType: data.ruleType as string,
        config: data.config,
        severity: (data.severity as string) ?? 'MEDIUM',
        isActive: (data.isActive as boolean) ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: data.createdById as string,
      };
      this.rules.push(r);
      const nested = data.escalationRule as { create?: Record<string, unknown> } | undefined;
      if (nested?.create) {
        this.escs.push({
          id: `esc_${this.n++}`,
          organizationId: nested.create.organizationId as string,
          alertRuleId: r.id,
          levels: nested.create.levels,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return this.materialize(r);
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const r = this.rules.find((r) => r.id === where.id)!;
      for (const k of Object.keys(data)) {
        if (data[k] !== undefined) (r as unknown as Record<string, unknown>)[k] = data[k];
      }
      return this.materialize(r);
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      this.rules = this.rules.filter((r) => r.id !== where.id);
      this.escs = this.escs.filter((e) => e.alertRuleId !== where.id);
      return {};
    }),
  };

  escalationRule = {
    deleteMany: vi.fn(async ({ where }: { where: { alertRuleId: string } }) => {
      const before = this.escs.length;
      this.escs = this.escs.filter((e) => e.alertRuleId !== where.alertRuleId);
      return { count: before - this.escs.length };
    }),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { alertRuleId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = this.escs.find((e) => e.alertRuleId === where.alertRuleId);
        if (existing) {
          existing.levels = update.levels;
          existing.updatedAt = new Date();
          return existing;
        }
        const e: FakeEsc = {
          id: `esc_${this.n++}`,
          organizationId: create.organizationId as string,
          alertRuleId: where.alertRuleId,
          levels: create.levels,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.escs.push(e);
        return e;
      },
    ),
  };

  private materialize(r: FakeRule) {
    const esc = this.escs.find((e) => e.alertRuleId === r.id);
    return {
      ...r,
      escalationRule: esc
        ? { id: esc.id, levels: esc.levels, createdAt: esc.createdAt, updatedAt: esc.updatedAt }
        : null,
    };
  }
}

class FakeAudit {
  records: Array<Record<string, unknown>> = [];
  record = vi.fn(async (input: Record<string, unknown>) => {
    this.records.push(input);
  });
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

function makeService(
  opts: { isAdmin?: boolean; alertsScope?: Scope; directReportIds?: string[]; unitMemberIds?: string[] } = {},
) {
  const prisma = new FakePrisma();
  const audit = new FakeAudit();
  const accessContext = new FakeAccessContext();
  accessContext.isAdmin = opts.isAdmin ?? false;
  if (opts.alertsScope) accessContext.alertsScope = opts.alertsScope;
  if (opts.directReportIds) accessContext.directReportIds = opts.directReportIds;
  if (opts.unitMemberIds) accessContext.unitMemberIds = opts.unitMemberIds;
  const service = new AlertRulesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    accessContext as unknown as AccessContextService,
  );
  return { service, prisma, audit, accessContext };
}

const staticDto = (overrides: Partial<CreateAlertRuleDto> = {}): CreateAlertRuleDto =>
  ({
    ruleType: 'STATIC_THRESHOLD',
    kpiId: 'kpi_1',
    name: 'High value',
    severity: 'HIGH',
    isActive: true,
    config: { operator: '>', value: 100 },
    ...overrides,
  }) as CreateAlertRuleDto;

describe('AlertRulesService.create', () => {
  test('creates a rule bound to a tenant KPI', async () => {
    const { service, prisma, audit } = makeService();
    prisma.kpis.push({ id: 'kpi_1', organizationId: ORG });

    const rule = await withCtx({}, () => service.create(staticDto()));
    expect(rule.ruleType).toBe('STATIC_THRESHOLD');
    expect(rule.organizationId).toBe(ORG);
    expect(prisma.rules).toHaveLength(1);
    expect(audit.records[0]!.action).toBe('CREATE');
  });

  test('404 when the KPI is not in the tenant', async () => {
    const { service } = makeService();
    await expect(withCtx({}, () => service.create(staticDto()))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  test('persists escalation levels and drops all-empty levels', async () => {
    const { service, prisma } = makeService();
    prisma.kpis.push({ id: 'kpi_1', organizationId: ORG });

    await withCtx({}, () =>
      service.create(
        staticDto({
          escalationLevels: [
            { delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: [] },
            { delayMinutes: 5, channelIds: [], notifyRoleIds: [], notifyUserIds: [] }, // empty → dropped
          ],
        }),
      ),
    );
    expect(prisma.escs).toHaveLength(1);
    expect((prisma.escs[0]!.levels as unknown[]).length).toBe(1);
  });
});

describe('AlertRulesService list/get tenancy', () => {
  test('list is org-scoped', async () => {
    const { service, prisma } = makeService();
    prisma.kpis.push({ id: 'k', organizationId: ORG });
    prisma.rules.push(
      { id: 'r1', organizationId: ORG, kpiId: 'k', name: 'a', description: null, ruleType: 'STATIC_THRESHOLD', config: {}, severity: 'LOW', isActive: true, createdAt: new Date(), updatedAt: new Date(), createdById: 'u1' },
      { id: 'r2', organizationId: 'other', kpiId: 'k', name: 'b', description: null, ruleType: 'STATIC_THRESHOLD', config: {}, severity: 'LOW', isActive: true, createdAt: new Date(), updatedAt: new Date(), createdById: 'u1' },
    );
    const rows = await withCtx({}, () => service.list());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('r1');
  });

  test('getById 404 for a rule in another tenant', async () => {
    const { service, prisma } = makeService();
    prisma.rules.push({ id: 'r2', organizationId: 'other', kpiId: 'k', name: 'b', description: null, ruleType: 'STATIC_THRESHOLD', config: {}, severity: 'LOW', isActive: true, createdAt: new Date(), updatedAt: new Date(), createdById: 'u1' });
    await expect(withCtx({}, () => service.getById('r2'))).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AlertRulesService.update escalation upsert/clear', () => {
  test('upserts escalation levels on update', async () => {
    const { service, prisma } = makeService();
    prisma.kpis.push({ id: 'kpi_1', organizationId: ORG });
    const rule = await withCtx({}, () => service.create(staticDto()));

    await withCtx({}, () =>
      service.update(rule.id, {
        escalationLevels: [
          { delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: [] },
        ],
      }),
    );
    expect(prisma.escs).toHaveLength(1);
  });

  test('empty escalation array clears the policy', async () => {
    const { service, prisma } = makeService();
    prisma.kpis.push({ id: 'kpi_1', organizationId: ORG });
    const rule = await withCtx({}, () =>
      service.create(
        staticDto({
          escalationLevels: [
            { delayMinutes: 0, channelIds: ['ch1'], notifyRoleIds: [], notifyUserIds: [] },
          ],
        }),
      ),
    );
    expect(prisma.escs).toHaveLength(1);

    await withCtx({}, () => service.update(rule.id, { escalationLevels: [] }));
    expect(prisma.escs).toHaveLength(0);
  });
});

describe('AlertRulesService.remove', () => {
  test('deletes the rule', async () => {
    const { service, prisma } = makeService();
    prisma.kpis.push({ id: 'kpi_1', organizationId: ORG });
    const rule = await withCtx({}, () => service.create(staticDto()));
    await withCtx({}, () => service.remove(rule.id));
    expect(prisma.rules).toHaveLength(0);
  });
});

describe('AlertRulesService visibility (Phase 2.5)', () => {
  test('non-admin ORG ⇒ kpiId limited to visible KPIs (floor), no createdById narrowing', async () => {
    const { service, prisma } = makeService();
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alertRule.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.kpiId).toEqual({ in: ['k1'] });
    expect(where.createdById).toBeUndefined();
  });

  test('SELF ⇒ createdById IN {me} AND the KPI floor', async () => {
    const { service, prisma } = makeService({ alertsScope: 'SELF' });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alertRule.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.kpiId).toEqual({ in: ['k1'] });
    expect(where.createdById).toEqual({ in: ['me'] });
  });

  test('DIRECT_REPORTS ⇒ createdById IN {me, reports}', async () => {
    const { service, prisma } = makeService({ alertsScope: 'DIRECT_REPORTS', directReportIds: ['rep'] });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alertRule.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.createdById).toEqual({ in: expect.arrayContaining(['me', 'rep']) });
  });

  test('UNITS ⇒ createdById IN {me, peers}', async () => {
    const { service, prisma } = makeService({ alertsScope: 'UNITS', unitMemberIds: ['peer'] });
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]);
    await withCtx({ userId: 'me' }, () => service.list());
    const where = prisma.alertRule.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.createdById).toEqual({ in: expect.arrayContaining(['me', 'peer']) });
  });

  test('admin ⇒ no floor, no createdById narrowing, KPI set not queried', async () => {
    const { service, prisma } = makeService({ isAdmin: true });
    await withCtx({ userId: 'admin' }, () => service.list());
    const where = prisma.alertRule.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.kpiId).toBeUndefined();
    expect(where.createdById).toBeUndefined();
    expect(prisma.kPI.findMany).not.toHaveBeenCalled();
  });

  test('getById ⇒ 404 when the rule’s KPI is not visible', async () => {
    const { service, prisma } = makeService();
    prisma.kPI.findMany.mockResolvedValue([{ id: 'k1' }]); // only k1 visible
    prisma.rules.push({
      id: 'r1', organizationId: ORG, kpiId: 'kX', name: 'a', description: null,
      ruleType: 'STATIC_THRESHOLD', config: {}, severity: 'LOW', isActive: true,
      createdAt: new Date(), updatedAt: new Date(), createdById: 'me',
    });
    await expect(withCtx({ userId: 'me' }, () => service.getById('r1'))).rejects.toBeInstanceOf(NotFoundException);
  });
});
