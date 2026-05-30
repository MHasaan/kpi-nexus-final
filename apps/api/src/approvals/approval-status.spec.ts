/**
 * Pure approval-resolution logic. 6 cases covering single-approver (any) and
 * requireAll modes, plus rejection short-circuit.
 */
import { describe, expect, test } from 'vitest';

import { resolveStatus } from './approval-status.js';

describe('resolveStatus', () => {
  test('single-approver mode: first approval → APPROVED', () => {
    expect(
      resolveStatus({ requireAll: false, requiredApproverCount: 1, decisions: [{ userId: 'a', decision: 'approve' }] }),
    ).toBe('APPROVED');
  });

  test('single-approver mode: first rejection → REJECTED', () => {
    expect(
      resolveStatus({ requireAll: false, requiredApproverCount: 1, decisions: [{ userId: 'a', decision: 'reject' }] }),
    ).toBe('REJECTED');
  });

  test('any rejection short-circuits to REJECTED even under requireAll', () => {
    expect(
      resolveStatus({
        requireAll: true,
        requiredApproverCount: 2,
        decisions: [{ userId: 'a', decision: 'approve' }, { userId: 'b', decision: 'reject' }],
      }),
    ).toBe('REJECTED');
  });

  test('requireAll: not all approved yet → PENDING', () => {
    expect(
      resolveStatus({ requireAll: true, requiredApproverCount: 2, decisions: [{ userId: 'a', decision: 'approve' }] }),
    ).toBe('PENDING');
  });

  test('requireAll: all required approvers approved → APPROVED', () => {
    expect(
      resolveStatus({
        requireAll: true,
        requiredApproverCount: 2,
        decisions: [{ userId: 'a', decision: 'approve' }, { userId: 'b', decision: 'approve' }],
      }),
    ).toBe('APPROVED');
  });

  test('no decisions yet → PENDING', () => {
    expect(resolveStatus({ requireAll: false, requiredApproverCount: 1, decisions: [] })).toBe('PENDING');
  });

  test('requireAll counts distinct approvers (duplicate approvals do not over-count)', () => {
    expect(
      resolveStatus({
        requireAll: true,
        requiredApproverCount: 2,
        decisions: [{ userId: 'a', decision: 'approve' }, { userId: 'a', decision: 'approve' }],
      }),
    ).toBe('PENDING');
  });
});
