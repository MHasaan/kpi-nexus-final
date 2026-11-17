import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RequestContextStore } from '../tenancy/request-context.js';
import { KpiDataService } from './kpi-data.service.js';

const ORG = 'org_1';

const mockPrisma = {
  kPIAssignmentOrgUnit: { findFirst: vi.fn(), update: vi.fn() },
};

const mockAccessContext = {
  kpiPointScopeWhere: vi.fn(),
};

function makeSvc(): KpiDataService {
  const svc = new KpiDataService(
    mockPrisma as never,
    {} as never,
    mockAccessContext as never,
    {} as never,
    {} as never,
    {} as never,
  );
  // insertDataPoint is covered elsewhere; here we only care who gets that far.
  vi.spyOn(svc as unknown as { insertDataPoint: (p: unknown) => Promise<unknown> }, 'insertDataPoint').mockResolvedValue({
    id: 'dp1',
    value: 5,
  } as never);
  return svc;
}

const dto = { value: 5, periodStart: new Date(), periodEnd: new Date() } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(RequestContextStore, 'require').mockReturnValue({
    organizationId: ORG,
    userId: 'u1',
    roleId: null,
    principalType: 'user',
  } as never);
  mockPrisma.kPIAssignmentOrgUnit.findFirst.mockResolvedValue({
    id: 'a1',
    kpiId: 'k1',
    orgUnitId: 'unit_eng',
    targetValue: 10,
    kpi: { scope: 'PER_UNIT', direction: 'HIGHER_IS_BETTER' },
  });
  mockPrisma.kPIAssignmentOrgUnit.update.mockResolvedValue({});
});

describe('recordForOrgUnitAssignment — the unit must be in the caller’s scope (UI-003)', () => {
  it('a member or manager of the unit may record', async () => {
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({ orgUnitId: { in: ['unit_eng', 'unit_sales'] } });
    await expect(makeSvc().recordForOrgUnitAssignment('a1', dto)).resolves.toMatchObject({ id: 'dp1' });
  });

  it('someone with no reach into that unit is refused, even holding KPI_DATA_ENTRY', async () => {
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({ orgUnitId: { in: ['unit_sales'] } });
    await expect(makeSvc().recordForOrgUnitAssignment('a1', dto)).rejects.toMatchObject({
      status: 403,
      response: { code: 'UNIT_NOT_IN_SCOPE' },
    });
    expect(mockPrisma.kPIAssignmentOrgUnit.update).not.toHaveBeenCalled();
  });

  it('a principal whose unit scope reaches nothing is refused', async () => {
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({ orgUnitId: { in: [] } });
    await expect(makeSvc().recordForOrgUnitAssignment('a1', dto)).rejects.toMatchObject({ status: 403 });
  });

  it('an admin, or anyone scoped to the whole org, may record for any unit', async () => {
    // kpiPointScopeWhere returns {} when the caller reaches every point.
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({});
    await expect(makeSvc().recordForOrgUnitAssignment('a1', dto)).resolves.toMatchObject({ id: 'dp1' });
  });

  it('the scope check does not mask the existing scope-mismatch answer', async () => {
    mockPrisma.kPIAssignmentOrgUnit.findFirst.mockResolvedValue({
      id: 'a1',
      kpiId: 'k1',
      orgUnitId: 'unit_eng',
      targetValue: null,
      kpi: { scope: 'ORG_WIDE', direction: 'HIGHER_IS_BETTER' },
    });
    mockAccessContext.kpiPointScopeWhere.mockResolvedValue({ orgUnitId: { in: [] } });
    await expect(makeSvc().recordForOrgUnitAssignment('a1', dto)).rejects.toMatchObject({
      status: 422,
      response: { code: 'SCOPE_MISMATCH' },
    });
  });
});
