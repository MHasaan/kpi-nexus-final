import { describe, expect, test } from 'vitest';

import { kindLabel, requestStanding, statusLabel, toggleApproverRole, workflowProblem, workflowSettings } from './approvals-view';

describe('workflowSettings', () => {
  test('a new organisation is shown all three kinds, off and ready to set (UI-008)', () => {
    expect(workflowSettings([])).toEqual([
      { entityType: 'KPI_DEFINITION', requiredApproverRoleIds: [], requireAll: false, isActive: false },
      { entityType: 'KPI_TARGET', requiredApproverRoleIds: [], requireAll: false, isActive: false },
      { entityType: 'ROLE_PERMISSIONS', requiredApproverRoleIds: [], requireAll: false, isActive: false },
    ]);
  });

  test('what is saved is shown; the rest stay off', () => {
    const settings = workflowSettings([{ id: 'w', entityType: 'KPI_TARGET', requiredApproverRoleIds: ['r1', 'r2'], requireAll: true, isActive: true }]);
    expect(settings[1]).toEqual({ entityType: 'KPI_TARGET', requiredApproverRoleIds: ['r1', 'r2'], requireAll: true, isActive: true });
    expect(settings[0]!.isActive).toBe(false);
  });
});

describe('approver roles', () => {
  test('several roles can approve: ticking adds, unticking removes', () => {
    expect(toggleApproverRole(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleApproverRole(['a', 'b'], 'a')).toEqual(['b']);
  });

  test('a workflow cannot be on with nobody to approve', () => {
    expect(workflowProblem({ isActive: true, requiredApproverRoleIds: [] })).toMatch(/approver role/);
    expect(workflowProblem({ isActive: true, requiredApproverRoleIds: ['a'] })).toBeNull();
    expect(workflowProblem({ isActive: false, requiredApproverRoleIds: [] })).toBeNull();
  });
});

describe('requestStanding', () => {
  test('an approver decides; the requester waits; anyone else watches', () => {
    expect(requestStanding({ canDecide: true, requesterUserId: 'eve' }, 'ada')).toBe('decide');
    expect(requestStanding({ canDecide: false, requesterUserId: 'eve' }, 'eve')).toBe('mine');
    expect(requestStanding({ canDecide: false, requesterUserId: 'eve' }, 'bob')).toBe('watch');
    expect(requestStanding({ canDecide: undefined, requesterUserId: 'eve' }, null)).toBe('watch');
  });
});

describe('labels', () => {
  test('kinds and statuses are words, not enum values', () => {
    expect(kindLabel('KPI_DEFINITION')).toBe('KPI change');
    expect(kindLabel('ROLE_PERMISSIONS')).toBe('Role permission change');
    expect(statusLabel('APPROVED')).toBe('Approved');
    expect(statusLabel('PENDING')).toBe('Waiting');
  });
});
