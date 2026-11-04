import { describe, expect, test } from 'vitest';

import { ALL_PERMISSIONS } from '@kpi-nexus/contracts';

import { PERMISSION_GROUPS, isApprovalPending, permissionToggleState } from './role-permissions';

describe('PERMISSION_GROUPS (FE-002)', () => {
  test('lists every canonical permission exactly once', () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe('permissionToggleState', () => {
  const callerHas = (k: string) => k === 'KPI_VIEW';

  test('an admin role is fully granted and locked', () => {
    expect(permissionToggleState({ roleIsAdmin: true, checked: false, callerHas, key: 'BILLING_MANAGE' })).toEqual({
      checked: true,
      disabled: true,
      reason: 'Admin roles hold every permission',
    });
  });

  test('a permission the editor holds can be toggled either way', () => {
    expect(permissionToggleState({ roleIsAdmin: false, checked: false, callerHas, key: 'KPI_VIEW' }).disabled).toBe(false);
    expect(permissionToggleState({ roleIsAdmin: false, checked: true, callerHas, key: 'KPI_VIEW' }).disabled).toBe(false);
  });

  test('a permission the editor lacks can be removed but not added (mirrors the API guard)', () => {
    expect(permissionToggleState({ roleIsAdmin: false, checked: true, callerHas, key: 'BILLING_MANAGE' }).disabled).toBe(false);
    const add = permissionToggleState({ roleIsAdmin: false, checked: false, callerHas, key: 'BILLING_MANAGE' });
    expect(add.disabled).toBe(true);
    expect(add.reason).toMatch(/don't hold/);
  });
});

describe('isApprovalPending', () => {
  test('recognises the 202 APPROVAL_REQUIRED body', () => {
    expect(isApprovalPending({ code: 'APPROVAL_REQUIRED', requestId: 'r1', message: 'x' })).toBe(true);
    expect(isApprovalPending({ id: 'role_1', permissions: [] })).toBe(false);
    expect(isApprovalPending(null)).toBe(false);
  });
});
