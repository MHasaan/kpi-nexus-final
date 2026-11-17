/** The editable part of a person, as the edit form holds it ('' = none). */
export interface UserEditForm {
  fullName: string;
  roleId: string;
  managerId: string;
  positionId: string;
}

export interface UserEditPatch {
  fullName?: string;
  roleId?: string;
  managerId?: string | null;
  positionId?: string | null;
}

interface EditableUser {
  fullName: string;
  roleId: string | null;
  managerId: string | null;
  positionId: string | null;
}

export function userEditForm(user: EditableUser): UserEditForm {
  return {
    fullName: user.fullName,
    roleId: user.roleId ?? '',
    managerId: user.managerId ?? '',
    positionId: user.positionId ?? '',
  };
}

/**
 * Only what changed, in the shape PATCH /users/:id takes. Clearing a manager or
 * a position sends null. A role cannot be cleared (the API has no "no role"
 * edit), so an emptied role picker is not a change.
 */
export function userEditPatch(user: EditableUser, form: UserEditForm): UserEditPatch {
  const patch: UserEditPatch = {};
  const name = form.fullName.trim();
  if (name && name !== user.fullName) patch.fullName = name;
  if (form.roleId && form.roleId !== (user.roleId ?? '')) patch.roleId = form.roleId;
  if (form.managerId !== (user.managerId ?? '')) patch.managerId = form.managerId || null;
  if (form.positionId !== (user.positionId ?? '')) patch.positionId = form.positionId || null;
  return patch;
}

/** Why the form cannot be saved as it stands, or null. */
export function userEditProblem(form: UserEditForm): string | null {
  const name = form.fullName.trim();
  if (name.length < 2) return 'Enter the person’s name (at least 2 characters).';
  if (name.length > 120) return 'The name is too long (120 characters at most).';
  return null;
}
