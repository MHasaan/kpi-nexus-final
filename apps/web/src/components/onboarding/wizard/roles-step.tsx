'use client';

import { ALL_PERMISSIONS, type DraftProblem, type OnboardingDraftInput } from '@kpi-nexus/contracts';

import { PERMISSION_GROUPS } from '../../../lib/role-permissions';
import {
  POSITION_TRACK_OPTIONS,
  isLastAdminRole,
  removePosition,
  removeRole,
  renamePosition,
  renameRole,
  setPermissions,
  standardRolesToAdd,
  togglePermission,
  trackValue,
} from '../../../lib/wizard-roles';
import { fieldClass } from './fields';
import { RowProblems, rowProblems } from './row-problems';

type Role = NonNullable<OnboardingDraftInput['roles']>[number];

export interface RolesStepProps {
  draft: OnboardingDraftInput;
  problems: readonly DraftProblem[];
  onChange: (patch: Partial<OnboardingDraftInput>) => void;
}

/**
 * Step 3: roles decide what someone can see and do; positions are job titles.
 * At least one role must be an administrator role, so the last one can be
 * neither demoted nor removed.
 */
export function RolesStep({ draft, problems, onChange }: RolesStepProps) {
  const roles = draft.roles ?? [];
  const positions = draft.positions ?? [];
  const standard = standardRolesToAdd(roles);
  const sectionProblem = problems.find((p) => p.section === 'roles' && p.index === undefined);
  const setRole = (index: number, next: Role) => onChange({ roles: roles.map((r, i) => (i === index ? next : r)) });

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          Roles <span className="font-normal text-content-muted">({roles.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">A role decides what someone can see and do. Everyone you invite is given one.</p>
        {sectionProblem && (
          <p role="alert" data-testid="roles-problem" className="mt-2 text-xs text-status-critical">
            {sectionProblem.message}
          </p>
        )}

        <ul className="mt-3 space-y-3">
          {roles.map((role, index) => {
            const lastAdmin = isLastAdminRole(roles, index);
            const granted = (role.permissions ?? []).filter((p) => (ALL_PERMISSIONS as readonly string[]).includes(p));
            return (
              <li key={index} data-testid={`role-card-${index}`} className="rounded-md border border-border-divider bg-surface-bg p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="sr-only" htmlFor={`role-name-${index}`}>
                      Role name
                    </label>
                    <input
                      id={`role-name-${index}`}
                      data-testid={`role-name-${index}`}
                      value={role.name}
                      onChange={(e) => onChange(renameRole(draft, index, e.target.value))}
                      placeholder="e.g. Team lead"
                      autoFocus={role.name === '' && index === roles.length - 1}
                      aria-invalid={rowProblems(problems, 'roles', index, 'name').length > 0 || undefined}
                      className={`${fieldClass} mt-0 max-w-xs`}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-content-strong" title={lastAdmin ? 'At least one role must be an administrator role' : undefined}>
                    <input
                      type="checkbox"
                      data-testid={`role-admin-${index}`}
                      checked={Boolean(role.isAdmin)}
                      disabled={lastAdmin}
                      onChange={(e) => setRole(index, { ...role, isAdmin: e.target.checked })}
                    />
                    Administrator
                  </label>
                  <button
                    type="button"
                    data-testid={`role-remove-${index}`}
                    onClick={() => onChange(removeRole(draft, index))}
                    disabled={lastAdmin}
                    title={lastAdmin ? 'At least one role must be an administrator role' : undefined}
                    aria-label={`Remove role ${role.name || index + 1}`}
                    className="rounded px-2 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:text-content-muted disabled:hover:bg-transparent"
                  >
                    Remove
                  </button>
                </div>
                <RowProblems problems={problems} section="roles" index={index} testId={`role-problem-${index}`} />

                {role.isAdmin ? (
                  <p className="mt-2 text-xs text-content-muted">
                    Administrators can do everything, so there are no permissions to choose.
                    {lastAdmin && ' This is the only administrator role, so it cannot be removed.'}
                  </p>
                ) : (
                  <details className="mt-2">
                    <summary data-testid={`role-permissions-${index}`} className="cursor-pointer text-xs font-medium text-accent-primary">
                      Permissions — {granted.length} of {ALL_PERMISSIONS.length}
                    </summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      {PERMISSION_GROUPS.map((group) => {
                        const keys = group.permissions.map((p) => p.key as string);
                        return (
                          <fieldset key={group.group}>
                            <legend className="flex w-full items-center justify-between text-xs font-semibold text-content-strong">
                              {group.group}
                              <span className="flex gap-2 font-normal">
                                <button
                                  type="button"
                                  data-testid={`role-${index}-group-all-${group.group}`}
                                  onClick={() => setRole(index, setPermissions(role, keys, true))}
                                  className="text-accent-primary hover:underline"
                                >
                                  All
                                </button>
                                <button
                                  type="button"
                                  data-testid={`role-${index}-group-none-${group.group}`}
                                  onClick={() => setRole(index, setPermissions(role, keys, false))}
                                  className="text-content-muted hover:underline"
                                >
                                  None
                                </button>
                              </span>
                            </legend>
                            <div className="mt-1.5 flex flex-col gap-1">
                              {group.permissions.map((permission) => (
                                <label key={permission.key} className="flex items-center gap-2 text-xs text-content-default">
                                  <input
                                    type="checkbox"
                                    data-testid={`role-${index}-perm-${permission.key}`}
                                    checked={granted.includes(permission.key)}
                                    onChange={() => setRole(index, togglePermission(role, permission.key))}
                                  />
                                  {permission.label}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        );
                      })}
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="role-add"
            onClick={() => onChange({ roles: [...roles, { name: '', isAdmin: false, permissions: [] }] })}
            className="rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary"
          >
            + Add role
          </button>
          {standard.length > 0 && (
            <button
              type="button"
              data-testid="roles-add-standard"
              onClick={() => onChange({ roles: [...roles, ...standard] })}
              className="rounded-full bg-surface-2 px-2.5 py-1 text-xs text-content-strong hover:bg-accent-primary/10"
            >
              + Add the standard roles ({standard.map((r) => r.name).join(', ')})
            </button>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <h2 className="text-sm font-semibold text-content-strong">
          Positions <span className="font-normal text-content-muted">({positions.length})</span>
        </h2>
        <p className="mt-1 text-xs text-content-muted">Job titles, such as Engineer or Account Manager. Optional — they describe people; they do not change what anyone can do.</p>

        <ul className="mt-3 space-y-2">
          {positions.map((position, index) => (
            <li key={index}>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`position-name-${index}`}>
                  Position name
                </label>
                <input
                  id={`position-name-${index}`}
                  data-testid={`position-name-${index}`}
                  value={position.name}
                  onChange={(e) => onChange(renamePosition(draft, index, e.target.value))}
                  placeholder="e.g. Engineer"
                  autoFocus={position.name === '' && index === positions.length - 1}
                  aria-invalid={rowProblems(problems, 'positions', index).length > 0 || undefined}
                  className={`${fieldClass} mt-0 max-w-xs flex-1`}
                />
                <label className="sr-only" htmlFor={`position-track-${index}`}>
                  Track of {position.name || 'this position'}
                </label>
                <select
                  id={`position-track-${index}`}
                  data-testid={`position-track-${index}`}
                  value={trackValue(position.track)}
                  onChange={(e) =>
                    onChange({
                      positions: positions.map((p, i) =>
                        i === index ? { ...p, track: e.target.value as (typeof POSITION_TRACK_OPTIONS)[number]['value'] } : p,
                      ),
                    })
                  }
                  className={`${fieldClass} mt-0 w-auto`}
                >
                  {POSITION_TRACK_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid={`position-remove-${index}`}
                  onClick={() => onChange(removePosition(draft, index))}
                  aria-label={`Remove position ${position.name || index + 1}`}
                  className="rounded px-2 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
                >
                  Remove
                </button>
              </div>
              <RowProblems problems={problems} section="positions" index={index} testId={`position-problem-${index}`} />
            </li>
          ))}
        </ul>

        <button
          type="button"
          data-testid="position-add"
          onClick={() => onChange({ positions: [...positions, { name: '' }] })}
          className="mt-3 rounded border border-border px-3 py-1.5 text-xs font-medium text-content-strong hover:border-accent-primary"
        >
          + Add position
        </button>
      </section>
    </div>
  );
}
