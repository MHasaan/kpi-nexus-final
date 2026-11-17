'use client';

import { type FormEvent, useEffect, useState } from 'react';

import {
  ApiError,
  updateUser,
  type PositionSummary,
  type RoleSummary,
  type UserSummary,
} from '../../lib/api-client';
import { useToast } from '../../lib/use-toast';
import { type UserEditForm, userEditForm, userEditPatch, userEditProblem } from '../../lib/user-edit';
import { Button, Card, Input, Label, Select } from '../ui';

export interface UserEditPanelProps {
  user: UserSummary;
  /** True when the person being edited is the one signed in. */
  isSelf: boolean;
  roles: readonly RoleSummary[];
  positions: readonly PositionSummary[];
  /** People who could be this person's manager (the person themself is left out here). */
  people: readonly UserSummary[];
  roleLabel: string;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Change a person's name, role, manager and position (UI-010). Sends only what
 * changed. Rules the server owns — no reporting loops, the last administrator
 * stays one, only an administrator hands out the administrator role — come
 * back as its message, shown here beside the fields.
 */
export function UserEditPanel({ user, isSelf, roles, positions, people, roleLabel, onSaved, onClose }: UserEditPanelProps) {
  const [form, setForm] = useState<UserEditForm>(() => userEditForm(user));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Editing someone else: start from their values, not the last person's.
  useEffect(() => {
    setForm(userEditForm(user));
    setError(null);
  }, [user.id]);

  const set = (key: keyof UserEditForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const managers = people.filter((p) => p.id !== user.id);
  // Keep a manager who has since left selectable, so opening the form never
  // silently drops them.
  const currentManagerMissing = form.managerId !== '' && !managers.some((m) => m.id === form.managerId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const problem = userEditProblem(form);
    if (problem) {
      setError(problem);
      return;
    }
    const patch = userEditPatch(user, form);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await updateUser(user.id, patch);
      toast.success('Changes saved', `${form.fullName.trim()} was updated.`);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save these changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="user-edit-panel">
      <div className="border-b border-border-divider px-4 py-3.5">
        <h2 className="text-sm font-semibold text-content-strong">Edit {user.fullName}</h2>
        <p className="mt-1 break-all font-mono text-xs text-content-muted">{user.email}</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-edit-name" required>
            Full name
          </Label>
          <Input
            id="user-edit-name"
            required
            value={form.fullName}
            onChange={set('fullName')}
            disabled={saving}
            data-testid="user-edit-name"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-edit-role">{roleLabel}</Label>
          <Select
            id="user-edit-role"
            value={form.roleId}
            onChange={set('roleId')}
            disabled={saving || isSelf}
            data-testid="user-edit-role"
            aria-describedby={isSelf ? 'user-edit-role-hint' : undefined}
          >
            {form.roleId === '' && <option value="">(no {roleLabel.toLowerCase()})</option>}
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          {isSelf && (
            <p id="user-edit-role-hint" className="text-xs text-content-muted">
              You cannot change your own {roleLabel.toLowerCase()}. Ask another administrator.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-edit-manager">Reports to</Label>
          <Select
            id="user-edit-manager"
            value={form.managerId}
            onChange={set('managerId')}
            disabled={saving}
            data-testid="user-edit-manager"
          >
            <option value="">(nobody)</option>
            {currentManagerMissing && <option value={form.managerId}>(current manager)</option>}
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
        </div>
        {positions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="user-edit-position">Position</Label>
            <Select
              id="user-edit-position"
              value={form.positionId}
              onChange={set('positionId')}
              disabled={saving}
              data-testid="user-edit-position"
            >
              <option value="">(no position)</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {error && (
          <p role="alert" data-testid="user-edit-error" className="text-sm text-status-critical">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" isLoading={saving} data-testid="user-edit-save" className="flex-1">
            Save changes
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving} data-testid="user-edit-cancel">
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
