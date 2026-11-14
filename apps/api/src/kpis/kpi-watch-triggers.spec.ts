/** KPI status changes are announced to the KPI's watchers (status_changed). */
import { describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpisService } from './kpis.service.js';

function make() {
  const kpi = {
    id: 'k1', organizationId: 'org_1', name: 'Revenue', description: null, unit: null, scope: 'ORG_WIDE', type: 'NUMBER',
    direction: 'HIGHER_IS_BETTER', frequency: 'MONTHLY', aggregationMethod: 'LAST', status: 'ACTIVE', targetValue: null,
    warningThreshold: null, criticalThreshold: null, allowNegative: false, scorecardQuadrant: null, ownerUserId: null, tags: [],
    isActive: true, isArchived: false, version: 1, deletedAt: null, createdAt: new Date(), updatedAt: new Date(), createdById: 'me',
    categoryId: null, orgUnitAssignments: [], userAssignments: [],
  };
  const prisma = {
    kPI: {
      findFirst: vi.fn(async () => kpi),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...kpi, ...data, version: 2 })),
    },
    kPIVersion: { create: vi.fn(async () => undefined) },
  };
  const accessContext = {
    isKpiVisible: vi.fn(async () => true),
    resolveForCurrentPrincipal: vi.fn(async () => ({
      isAdmin: true, capabilities: [], scopeByDomain: {},
      dataTypeFilters: { kpiCategoryIds: null, orgUnitIds: null, dashboardIds: null },
      dataLimits: { historyWindowDays: null, maxListRows: null, maxExportRows: null },
      context: { managedOrgUnitIds: [], memberOrgUnitIds: [], directReportIds: [] },
    })),
  };
  const watches = { enqueue: vi.fn(async (_job: unknown) => {}) };
  const svc = new KpisService(prisma as never, { record: vi.fn(async () => {}) } as never, accessContext as never, {} as never, undefined, undefined, watches as never);
  return { svc, watches };
}

describe('KpisService.transitionStatus → KPI watchers', () => {
  it('a status change is announced with the new status and who made it', async () => {
    const { svc, watches } = make();
    await RequestContextStore.run({ userId: 'me', organizationId: 'org_1', roleId: 'r', principalType: 'user' }, () => svc.transitionStatus('k1', 'PAUSED'));
    expect(watches.enqueue).toHaveBeenCalledWith({ organizationId: 'org_1', kpiId: 'k1', event: 'status_changed', actorUserId: 'me', detail: 'PAUSED' });
  });
});
