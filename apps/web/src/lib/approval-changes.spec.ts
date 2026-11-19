/**
 * An approver was shown the request as it is stored: `dto: {"type":"STATIC",
 * "value":2.5}`, `kind: create`, `kpiId: cmw…`. And a change to something that
 * exists listed every field it has (its id, its dates) as "changed to —",
 * because the request carries only the fields being changed.
 */
import { describe, expect, test } from 'vitest';

import { approvalChanges } from './approval-changes';

describe('approvalChanges', () => {
  test('a new target reads as a target, not as the stored request', () => {
    const rows = approvalChanges({ kind: 'create', kpiId: 'cmw123', dto: { type: 'STATIC', value: 2.5 } }, null);
    expect(rows).toEqual([{ label: 'Target', after: '2.5' }]);
  });

  test('a new target with dates says when it applies', () => {
    const rows = approvalChanges(
      { kind: 'create', kpiId: 'cmw123', dto: { type: 'STATIC', value: 40, effectiveFrom: '2027-01-01T00:00:00.000Z', effectiveTo: '2027-03-31T00:00:00.000Z' } },
      null,
    );
    expect(rows).toEqual([
      { label: 'Target', after: '40' },
      { label: 'Applies from', after: '2027-01-01' },
      { label: 'Until', after: '2027-03-31' },
    ]);
  });

  test('a change to a target shows only what changes, from and to', () => {
    const current = { id: 't1', kpiId: 'k1', organizationId: 'o1', type: 'STATIC', value: 3, effectiveFrom: null, createdAt: '2026-11-01T00:00:00.000Z' };
    const rows = approvalChanges({ kind: 'update', targetId: 't1', dto: { value: 2.5 } }, current);
    expect(rows).toEqual([{ label: 'Target', before: '3', after: '2.5' }]);
  });

  test('a change to a KPI names the fields in words and leaves out what stays the same', () => {
    const current = { id: 'k1', organizationId: 'o1', name: 'Churn', targetValue: 3, direction: 'LOWER_IS_BETTER', frequency: 'MONTHLY', createdAt: '2026-11-01T00:00:00.000Z' };
    const rows = approvalChanges({ name: 'Customer churn', targetValue: 2.5, direction: 'LOWER_IS_BETTER', frequency: 'WEEKLY' }, current);
    expect(rows).toEqual([
      { label: 'Name', before: 'Churn', after: 'Customer churn' },
      { label: 'Target', before: '3', after: '2.5' },
      { label: 'Frequency', before: 'Monthly', after: 'Weekly' },
    ]);
  });

  test('a change to a role says which permissions are added and which are taken away', () => {
    const current = { id: 'r1', name: 'Manager', isAdmin: false, permissions: ['KPI_VIEW', 'KPI_EDIT'] };
    const rows = approvalChanges({ permissions: ['KPI_VIEW', 'KPI_DELETE'], isAdmin: false }, current);
    expect(rows).toEqual([
      { label: 'Permissions added', after: 'Delete KPIs' },
      { label: 'Permissions taken away', after: 'Edit KPIs' },
    ]);
  });

  test('making a role an administrator is said in words', () => {
    const rows = approvalChanges({ isAdmin: true }, { id: 'r1', isAdmin: false, permissions: [] });
    expect(rows).toEqual([{ label: 'Full administrator access', before: 'No', after: 'Yes' }]);
  });

  test('numbers and dates are written the way the organisation writes them', () => {
    const rows = approvalChanges(
      { kind: 'create', kpiId: 'k', dto: { value: 45000, effectiveFrom: '2027-01-01T00:00:00.000Z' } },
      null,
      { number: (n) => `#${n}`, date: (d) => `on ${d.slice(0, 4)}` },
    );
    expect(rows).toEqual([
      { label: 'Target', after: '#45000' },
      { label: 'Applies from', after: 'on 2027' },
    ]);
  });

  test('a field this page does not know is still shown, in words; a cleared one says so', () => {
    const rows = approvalChanges({ scenarioName: 'Best case', unit: null }, { scenarioName: null, unit: 'USD' });
    expect(rows).toEqual([
      { label: 'Scenario name', before: 'Not set', after: 'Best case' },
      { label: 'Unit', before: 'USD', after: 'Not set' },
    ]);
  });

  test('a request with nothing in it gives no rows', () => {
    expect(approvalChanges(null, null)).toEqual([]);
    expect(approvalChanges({ name: 'Churn' }, { name: 'Churn' })).toEqual([]);
  });
});
