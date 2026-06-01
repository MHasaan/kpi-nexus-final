/**
 * OrganizationsService unit tests. In-memory Prisma fake + no-op audit.
 * Covers: terminology read (singular + optional plural overrides),
 * plural-label round-trip via updateMine, and not-found mapping.
 */
import { describe, expect, test, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';

import type { AuditService } from '../audit/audit.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore, type RequestContext } from '../tenancy/request-context.js';
import { OrganizationsService } from './organizations.service.js';

const ORG = 'org_alpha';

/** Default singular + null plural labels for a freshly-seeded org row. */
function seedOrgRow(organizationId: string): Record<string, unknown> {
  return {
    id: organizationId,
    name: 'Acme',
    slug: 'acme',
    tenantStatus: 'ACTIVE',
    sizeTier: 'SMALL',
    industry: null,
    type: null,
    logoUrl: null,
    faviconUrl: null,
    primaryColor: null,
    secondaryColor: null,
    timezone: 'UTC',
    currency: 'USD',
    locale: 'en',
    dateFormat: 'YYYY-MM-DD',
    numberFormat: '1,000.00',
    weekStartsOn: 0,
    fiscalCalendar: null,
    roleLabel: 'Role',
    groupLabel: 'Group',
    memberLabel: 'Member',
    kpiLabel: 'KPI',
    dashboardLabel: 'Dashboard',
    scorecardLabel: 'Scorecard',
    objectiveLabel: 'Objective',
    taskLabel: 'Task',
    roleLabelPlural: null,
    groupLabelPlural: null,
    memberLabelPlural: null,
    kpiLabelPlural: null,
    dashboardLabelPlural: null,
    scorecardLabelPlural: null,
    objectiveLabelPlural: null,
    taskLabelPlural: null,
    dataResidency: 'US',
    complianceProfile: [],
    passwordPolicy: null,
    planKey: 'free',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

class FakePrisma {
  rows: Record<string, Record<string, unknown>> = {};

  organization = {
    findUnique: vi.fn(
      async ({ where, select }: { where: { id: string }; select: Record<string, true> }) => {
        const row = this.rows[where.id];
        if (!row) return null;
        return project(row, select);
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
        select: Record<string, true>;
      }) => {
        const row = this.rows[where.id];
        if (!row) throw new Error('not found');
        for (const k of Object.keys(data)) {
          if (data[k] !== undefined) row[k] = data[k];
        }
        return project(row, select);
      },
    ),
  };
}

/** Mimics Prisma's `select` projection so the fake returns only asked-for keys. */
function project(row: Record<string, unknown>, select: Record<string, true>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(select)) out[k] = row[k];
  return out;
}

class FakeAudit {
  record = vi.fn(async () => {});
}

function withCtx<T>(ctx: Partial<RequestContext>, fn: () => Promise<T> | T): Promise<T> | T {
  return RequestContextStore.run(
    { userId: 'u1', organizationId: ctx.organizationId ?? ORG, roleId: null, principalType: 'user' },
    fn,
  );
}

function makeService(seedOrgs: string[] = [ORG]) {
  const prisma = new FakePrisma();
  for (const id of seedOrgs) prisma.rows[id] = seedOrgRow(id);
  const service = new OrganizationsService(
    prisma as unknown as PrismaService,
    new FakeAudit() as unknown as AuditService,
  );
  return { service, prisma };
}

describe('OrganizationsService', () => {
  test('getTerminology returns singular labels and null plural overrides by default', async () => {
    const { service } = makeService();
    const term = await withCtx({}, () => service.getTerminology());
    expect(term.kpiLabel).toBe('KPI');
    expect(term.taskLabel).toBe('Task');
    // Plural overrides unset → null.
    expect(term.kpiLabelPlural).toBeNull();
    expect(term.roleLabelPlural).toBeNull();
    expect(term.taskLabelPlural).toBeNull();
  });

  test('plural label overrides round-trip (set via updateMine, read via getTerminology)', async () => {
    const { service } = makeService();
    await withCtx({}, () =>
      service.updateMine({
        kpiLabelPlural: 'KPIs',
        memberLabelPlural: 'People',
        objectiveLabelPlural: 'Objectives',
      }),
    );
    const term = await withCtx({}, () => service.getTerminology());
    expect(term.kpiLabelPlural).toBe('KPIs');
    expect(term.memberLabelPlural).toBe('People');
    expect(term.objectiveLabelPlural).toBe('Objectives');
    // Untouched plural fields stay null.
    expect(term.taskLabelPlural).toBeNull();
  });

  test('updateMine returns plural fields in the response shape', async () => {
    const { service } = makeService();
    const updated = (await withCtx({}, () =>
      service.updateMine({ dashboardLabelPlural: 'Dashboards' }),
    )) as Record<string, unknown>;
    expect(updated.dashboardLabelPlural).toBe('Dashboards');
  });

  test('null clears a previously-set plural override', async () => {
    const { service } = makeService();
    await withCtx({}, () => service.updateMine({ scorecardLabelPlural: 'Scorecards' }));
    await withCtx({}, () => service.updateMine({ scorecardLabelPlural: null }));
    const term = await withCtx({}, () => service.getTerminology());
    expect(term.scorecardLabelPlural).toBeNull();
  });

  test('plural overrides are org-scoped (no cross-tenant bleed)', async () => {
    const { service } = makeService([ORG, 'org_beta']);
    await withCtx({}, () => service.updateMine({ groupLabelPlural: 'Teams' }));
    const beta = await withCtx({ organizationId: 'org_beta' }, () => service.getTerminology());
    expect(beta.groupLabelPlural).toBeNull();
  });

  test('getTerminology throws NotFoundException when org missing', async () => {
    const { service } = makeService([]);
    await expect(withCtx({}, () => service.getTerminology())).rejects.toBeInstanceOf(NotFoundException);
  });
});
