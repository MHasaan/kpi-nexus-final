import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiAssignmentsService } from './kpi-assignments.service.js';

const ORG = 'org_1';

const mockPrisma = {
  kPI: { findFirst: vi.fn() },
  kPIAssignmentOrgUnit: { findMany: vi.fn() },
  kPIAssignmentUser: { findMany: vi.fn() },
};

const mockAccessContext = {
  isKpiVisible: vi.fn(),
  kpiPointScopeWhere: vi.fn(),
  kpiCategoryAllowlist: vi.fn(),
};

function makeSvc(): KpiAssignmentsService {
  return new KpiAssignmentsService(mockPrisma as never, mockAccessContext as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'u1',
    roleId: null,
    principalType: 'user',
  } as never);
  mockAccessContext.isKpiVisible.mockResolvedValue(true);
  mockAccessContext.kpiCategoryAllowlist.mockResolvedValue(null);
  mockAccessContext.kpiPointScopeWhere.mockResolvedValue({});
  mockPrisma.kPIAssignmentOrgUnit.findMany.mockResolvedValue([]);
  mockPrisma.kPIAssignmentUser.findMany.mockResolvedValue([]);
});

describe('KpiAssignmentsService.listForKpi (UI-004)', () => {
  it('a PER_UNIT KPI lists its units with their own value and target', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k1', scope: 'PER_UNIT', categoryId: null });
    mockPrisma.kPIAssignmentOrgUnit.findMany.mockResolvedValue([
      {
        id: 'a1',
        orgUnitId: 'unit_eng',
        inherited: false,
        inheritedFromUnitId: null,
        targetValue: 10,
        currentValue: 8,
        status: 'at_risk',
        orgUnit: { name: 'Engineering' },
      },
    ]);
    const result = await makeSvc().listForKpi('k1');
    expect(result.units).toEqual([
      {
        assignmentId: 'a1',
        orgUnitId: 'unit_eng',
        name: 'Engineering',
        inherited: false,
        inheritedFromUnitId: null,
        targetValue: 10,
        currentValue: 8,
        status: 'at_risk',
      },
    ]);
    expect(result.users).toEqual([]);
  });

  it('a PER_USER KPI lists its people', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k2', scope: 'PER_USER', categoryId: null });
    mockPrisma.kPIAssignmentUser.findMany.mockResolvedValue([
      { id: 'a2', userId: 'u9', targetValue: 5, currentValue: 6, status: 'exceeded', user: { fullName: 'Aisha Khan' } },
    ]);
    const result = await makeSvc().listForKpi('k2');
    expect(result.users).toEqual([
      { assignmentId: 'a2', userId: 'u9', name: 'Aisha Khan', targetValue: 5, currentValue: 6, status: 'exceeded' },
    ]);
    expect(result.units).toEqual([]);
  });

  it('an ORG_WIDE KPI has no assignments to list, and nothing is queried', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k3', scope: 'ORG_WIDE', categoryId: null });
    const result = await makeSvc().listForKpi('k3');
    expect(result).toEqual({ scope: 'ORG_WIDE', units: [], users: [] });
    expect(mockPrisma.kPIAssignmentOrgUnit.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.kPIAssignmentUser.findMany).not.toHaveBeenCalled();
  });

  it('only the units the caller may read are listed', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k1', scope: 'PER_UNIT', categoryId: null });
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({ orgUnitId: { in: ['unit_eng'] } });
    await makeSvc().listForKpi('k1');
    const where = mockPrisma.kPIAssignmentOrgUnit.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where).toMatchObject({ kpiId: 'k1', organizationId: ORG, orgUnitId: { in: ['unit_eng'] } });
  });

  it('only the people the caller may read are listed', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k2', scope: 'PER_USER', categoryId: null });
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({ userId: { in: ['u1'] } });
    await makeSvc().listForKpi('k2');
    const where = mockPrisma.kPIAssignmentUser.findMany.mock.calls[0]![0].where as Record<string, unknown>;
    expect(where).toMatchObject({ kpiId: 'k2', organizationId: ORG, userId: { in: ['u1'] } });
  });

  it('a KPI outside the caller’s scope is 404, the same as a missing one', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k1', scope: 'PER_UNIT', categoryId: null });
    mockAccessContext.isKpiVisible.mockResolvedValue(false);
    await expect(makeSvc().listForKpi('k1')).rejects.toMatchObject({ status: 404 });
  });

  it('a KPI in a category the caller may not see is 404 too', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue({ id: 'k1', scope: 'PER_UNIT', categoryId: 'cat_hidden' });
    mockAccessContext.kpiCategoryAllowlist.mockResolvedValue(['cat_allowed']);
    await expect(makeSvc().listForKpi('k1')).rejects.toMatchObject({ status: 404 });
  });

  it('a KPI in another tenant is 404', async () => {
    mockPrisma.kPI.findFirst.mockResolvedValue(null);
    await expect(makeSvc().listForKpi('nope')).rejects.toMatchObject({ status: 404 });
  });
});
