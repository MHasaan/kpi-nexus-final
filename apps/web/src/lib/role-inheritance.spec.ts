import { describe, expect, test } from 'vitest';

import { inheritedFrom } from './role-inheritance';

const roles = [
  { id: 'viewer', name: 'Viewer', permissions: ['KPI_VIEW'] },
  { id: 'editor', name: 'Editor', permissions: ['KPI_VIEW', 'KPI_EDIT'] },
  { id: 'lead', name: 'Lead', permissions: ['REPORTS_VIEW'] },
  { id: 'alone', name: 'Alone', permissions: [] },
];
// child inherits from parent
const edges = [
  { parentRoleId: 'viewer', childRoleId: 'editor' },
  { parentRoleId: 'editor', childRoleId: 'lead' },
];

describe('inheritedFrom — what a role gets from the roles above it', () => {
  test('a role with nothing above it inherits nothing', () => {
    expect(inheritedFrom('alone', roles, edges)).toEqual({ from: [], permissions: [] });
    expect(inheritedFrom('viewer', roles, edges)).toEqual({ from: [], permissions: [] });
  });

  test('it names every role above, nearest first, and the permissions they add', () => {
    expect(inheritedFrom('lead', roles, edges)).toEqual({ from: ['Editor', 'Viewer'], permissions: ['KPI_EDIT', 'KPI_VIEW'] });
  });

  test('a permission the role already has itself is not counted as inherited', () => {
    expect(inheritedFrom('editor', roles, edges)).toEqual({ from: ['Viewer'], permissions: [] });
  });

  test('a loop in the data does not hang it', () => {
    const loop = [...edges, { parentRoleId: 'lead', childRoleId: 'viewer' }];
    expect(inheritedFrom('lead', roles, loop).from.sort()).toEqual(['Editor', 'Viewer']);
  });
});
