/**
 * AlertRulesService unit tests. In-memory Prisma fake + no-op audit.
 * Covers: create (happy + KPI-tenant guard + empty-escalation-level drop),
 * org-scoped list/get, escalation upsert/clear on update, delete.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
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

class FakePrisma {
  private n = 1;
  rules: FakeRule[] = [];
  escs: FakeEsc[] = [];
  kpis: { id: string; organizationId: string }[] = [];

  kPI = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.kpis.find((k) => k.id === where.id && k.organizationId === where.organizationId) ?? null,
    ),
  };

  alertRule = {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      this.rules
        .filter(
          (r) =>
            r.organizationId === where.organizationId &&
            (where.kpiId === undefined || r.kpiId === where.kpiId),
        )
        .map((r) => this.materialize(r)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const r = this.rules.find(
        (r) => r.id === where.id && r.organizationId === where.organizationId,
      );
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
  const service = new AlertRulesService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, prisma, audit };
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
