import { describe, expect, test } from 'vitest';

import { canDecide, targetKpiId } from './approval-view.js';

const request = (extra: Record<string, unknown> = {}) => ({
  status: 'PENDING',
  requesterUserId: 'editor',
  workflowId: 'wf',
  decisions: [],
  ...extra,
});
const approver = { userId: 'boss', roleId: 'role-approver' };
const roles = ['role-approver'];

describe('canDecide — the buttons appear exactly when pressing them would work (UI-008)', () => {
  test('someone whose role approves this kind of change can decide', () => {
    expect(canDecide(request(), approver, roles)).toBe(true);
  });

  test('the person who asked cannot decide their own request, whatever their role', () => {
    expect(canDecide(request({ requesterUserId: 'boss' }), approver, roles)).toBe(false);
  });

  test('…unless they are an administrator and nobody else could decide it', () => {
    expect(canDecide(request({ requesterUserId: 'boss' }), approver, roles, { soleApprover: true })).toBe(true);
    expect(canDecide(request({ requesterUserId: 'boss' }), approver, roles, { soleApprover: false })).toBe(false);
  });

  test('someone whose role is not an approver cannot', () => {
    expect(canDecide(request(), { userId: 'x', roleId: 'role-other' }, roles)).toBe(false);
    expect(canDecide(request(), { userId: 'x', roleId: null }, roles)).toBe(false);
  });

  test('someone who has already decided cannot decide again', () => {
    expect(canDecide(request({ decisions: [{ userId: 'boss', decision: 'approve' }] }), approver, roles)).toBe(false);
    expect(canDecide(request({ decisions: [{ userId: 'other', decision: 'approve' }] }), approver, roles)).toBe(true);
  });

  test('a request that is no longer pending cannot be decided', () => {
    for (const status of ['APPROVED', 'REJECTED', 'CANCELLED']) expect(canDecide(request({ status }), approver, roles)).toBe(false);
  });

  test('a request whose workflow is gone cannot be decided', () => {
    expect(canDecide(request(), approver, undefined)).toBe(false);
  });
});

describe('targetKpiId', () => {
  test('a new target names its KPI in the payload', () => {
    expect(targetKpiId({ entityId: 'whatever', proposedPayload: { kind: 'create', kpiId: 'kpi-1', dto: {} } })).toBe('kpi-1');
  });
  test('otherwise the entity is the KPI', () => {
    expect(targetKpiId({ entityId: 'kpi-2', proposedPayload: { kind: 'update', targetId: 't' } })).toBe('kpi-2');
    expect(targetKpiId({ entityId: 'kpi-2', proposedPayload: null })).toBe('kpi-2');
  });
});
