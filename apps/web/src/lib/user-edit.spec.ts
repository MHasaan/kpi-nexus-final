import { describe, expect, test } from 'vitest';

import { userEditForm, userEditPatch, userEditProblem } from './user-edit';

const user = { fullName: 'Dev Person', roleId: 'role-emp', managerId: 'boss', positionId: null };

describe('userEditPatch', () => {
  test('an untouched form changes nothing', () => {
    expect(userEditPatch(user, userEditForm(user))).toEqual({});
  });

  test('sends only what changed', () => {
    expect(userEditPatch(user, { ...userEditForm(user), fullName: '  Devi Person ' })).toEqual({ fullName: 'Devi Person' });
    expect(userEditPatch(user, { ...userEditForm(user), roleId: 'role-mgr' })).toEqual({ roleId: 'role-mgr' });
  });

  test('clearing a manager or a position sends null', () => {
    expect(userEditPatch(user, { ...userEditForm(user), managerId: '' })).toEqual({ managerId: null });
    const withPosition = { ...user, positionId: 'pos-1' };
    expect(userEditPatch(withPosition, { ...userEditForm(withPosition), positionId: '' })).toEqual({ positionId: null });
  });

  test('setting a manager or a position sends the id', () => {
    expect(userEditPatch(user, { ...userEditForm(user), managerId: 'other', positionId: 'pos-2' })).toEqual({
      managerId: 'other',
      positionId: 'pos-2',
    });
  });

  test('an emptied role picker is not a change — a role cannot be cleared', () => {
    expect(userEditPatch(user, { ...userEditForm(user), roleId: '' })).toEqual({});
  });
});

describe('userEditProblem', () => {
  test('needs a real name', () => {
    expect(userEditProblem({ ...userEditForm(user), fullName: ' A ' })).toMatch(/name/);
    expect(userEditProblem({ ...userEditForm(user), fullName: 'x'.repeat(121) })).toMatch(/too long/);
    expect(userEditProblem(userEditForm(user))).toBeNull();
  });
});
