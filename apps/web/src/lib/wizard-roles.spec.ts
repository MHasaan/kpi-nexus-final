import { ALL_PERMISSIONS, DEFAULT_ROLES } from '@kpi-nexus/contracts';
import { describe, expect, test } from 'vitest';

import { PERMISSION_GROUPS } from './role-permissions';
import {
  isLastAdminRole,
  removePosition,
  removeRole,
  renamePosition,
  renameRole,
  setPermissions,
  standardRolesToAdd,
  togglePermission,
  trackValue,
} from './wizard-roles';

const role = (name: string, isAdmin = false, permissions: string[] = []) => ({ name, isAdmin, permissions });

describe('standardRolesToAdd', () => {
  test('an empty draft is offered the four roles a plain registration creates', () => {
    const added = standardRolesToAdd([]);
    expect(added.map((r) => r.name)).toEqual(DEFAULT_ROLES.map((r) => r.name));
    expect(added.filter((r) => r.isAdmin).map((r) => r.name)).toEqual(['Admin']);
    expect(added.find((r) => r.name === 'Viewer')!.permissions).toEqual(['KPI_VIEW', 'DASHBOARD_VIEW', 'REPORTS_VIEW']);
  });

  test('roles the draft already has, by name, are not added twice', () => {
    expect(standardRolesToAdd([role('admin', true), role('Viewer')]).map((r) => r.name)).toEqual(['Manager', 'Employee']);
  });

  test('every permission they grant is one the matrix can show', () => {
    const shown = new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key as string)));
    for (const r of standardRolesToAdd([])) for (const p of r.permissions ?? []) expect(shown.has(p), `${r.name}: ${p}`).toBe(true);
    expect(shown.size).toBe(ALL_PERMISSIONS.length);
  });
});

describe('isLastAdminRole', () => {
  test('the only administrator role is the last one', () => {
    expect(isLastAdminRole([role('Admin', true), role('Member')], 0)).toBe(true);
  });
  test('with two, neither is; an ordinary role never is', () => {
    const roles = [role('Admin', true), role('Owner', true), role('Member')];
    expect(isLastAdminRole(roles, 0)).toBe(false);
    expect(isLastAdminRole(roles, 2)).toBe(false);
  });
});

describe('permissions', () => {
  test('toggle adds, then removes', () => {
    const once = togglePermission(role('Analyst'), 'KPI_VIEW');
    expect(once.permissions).toEqual(['KPI_VIEW']);
    expect(togglePermission(once, 'KPI_VIEW').permissions).toEqual([]);
  });

  test('a whole group is granted or cleared without touching the rest, and without duplicates', () => {
    const base = role('Analyst', false, ['REPORTS_VIEW', 'KPI_VIEW']);
    const all = setPermissions(base, ['KPI_VIEW', 'KPI_EDIT'], true);
    expect(all.permissions).toEqual(['REPORTS_VIEW', 'KPI_VIEW', 'KPI_EDIT']);
    expect(setPermissions(all, ['KPI_VIEW', 'KPI_EDIT'], false).permissions).toEqual(['REPORTS_VIEW']);
  });
});

describe('renames and removals follow through to the people invited', () => {
  const draft = {
    roles: [role('Admin', true), role('Member')],
    positions: [{ name: 'Engineer' }, { name: 'Designer' }],
    team: [
      { email: 'a@x.test', fullName: 'A A', role: 'member', position: 'Engineer' },
      { email: 'b@x.test', fullName: 'B B', role: 'Admin' },
    ],
  };

  test('renaming a role renames it on them', () => {
    const patch = renameRole(draft, 1, 'Staff');
    expect(patch.roles!.map((r) => r.name)).toEqual(['Admin', 'Staff']);
    expect(patch.team!.map((p) => p.role)).toEqual(['Staff', 'Admin']);
  });

  test('removing a role leaves them with none', () => {
    const patch = removeRole(draft, 1);
    expect(patch.roles!.map((r) => r.name)).toEqual(['Admin']);
    expect(patch.team![0]).toEqual({ email: 'a@x.test', fullName: 'A A', position: 'Engineer' });
  });

  test('positions behave the same way', () => {
    expect(renamePosition(draft, 0, 'Software Engineer').team![0]!.position).toBe('Software Engineer');
    expect(removePosition(draft, 0).team![0]).not.toHaveProperty('position');
  });

  test('a role or position nobody was invited with leaves the team alone', () => {
    expect(Object.keys(renamePosition(draft, 1, 'UX Designer'))).toEqual(['positions']);
  });
});

describe('trackValue', () => {
  test('IC and nothing both mean individual contributor', () => {
    expect(trackValue('IC')).toBe('INDIVIDUAL_CONTRIBUTOR');
    expect(trackValue(undefined)).toBe('INDIVIDUAL_CONTRIBUTOR');
    expect(trackValue('EXECUTIVE')).toBe('EXECUTIVE');
  });
});
