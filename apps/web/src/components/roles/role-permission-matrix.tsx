'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '../ui';
import { cn } from '../../lib/cn';
import { ApiError, updateRole, type RoleSummary } from '../../lib/api-client';
import { PERMISSION_GROUPS, isApprovalPending, permissionToggleState } from '../../lib/role-permissions';
import { usePermissions } from '../../lib/use-permissions';

/**
 * Editable permission matrix for one role (FE-002). Toggles build a draft;
 * Save sends the full list via PATCH /roles/:id. The API may apply it (200) or
 * queue it behind a ROLE_PERMISSIONS approval workflow (202), and refuses to
 * add permissions the editor doesn't hold — the checkboxes mirror that rule.
 */
export function RolePermissionMatrix({
  role,
  onSaved,
}: {
  role: RoleSummary;
  onSaved: (updated: RoleSummary) => void;
}) {
  const { has } = usePermissions();
  const [draft, setDraft] = useState<string[]>(role.permissions);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Re-sync the draft when the persisted permissions change (incl. after our own
  // save); clear feedback only when switching to another role, so "saved" stays.
  useEffect(() => {
    setDraft(role.permissions);
  }, [role.permissions]);
  useEffect(() => {
    setFeedback(null);
  }, [role.id]);

  const dirty = useMemo(() => {
    const a = new Set(draft);
    return a.size !== role.permissions.length || role.permissions.some((p) => !a.has(p));
  }, [draft, role.permissions]);

  const toggle = (key: string) => {
    setFeedback(null);
    setDraft((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const res: unknown = await updateRole(role.id, { permissions: draft });
      if (isApprovalPending(res)) {
        setDraft(role.permissions);
        setFeedback({ ok: true, msg: 'Change submitted for approval — it applies once approved.' });
      } else {
        onSaved(res as RoleSummary);
        setFeedback({ ok: true, msg: 'Permissions saved.' });
      }
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof ApiError ? err.message : 'Failed to save permissions' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="role-permission-matrix">
      <div className="mt-5 flex flex-col gap-5">
        {PERMISSION_GROUPS.map(({ group, permissions }) => (
          <fieldset key={group}>
            <legend className="kn-eyebrow mb-2.5">{group}</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2.5">
              {permissions.map(({ key, label }) => {
                const state = permissionToggleState({
                  roleIsAdmin: role.isAdmin,
                  checked: draft.includes(key),
                  key,
                  callerHas: has,
                });
                return (
                  <label
                    key={key}
                    title={state.reason}
                    className={cn(
                      'inline-flex w-44 items-center gap-2',
                      state.disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={state.checked}
                      disabled={state.disabled || saving}
                      onChange={() => toggle(key)}
                      data-testid={`perm-${role.name}-${key}`}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        'flex shrink-0 items-center justify-center rounded peer-focus-visible:ring-2 peer-focus-visible:ring-ring',
                        state.checked
                          ? 'bg-accent-primary text-white'
                          : 'border border-border-strong bg-surface-bg text-transparent',
                      )}
                      style={{ width: 18, height: 18 }}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-sm text-content-default">{label}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {!role.isAdmin && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={!dirty || saving}
            isLoading={saving}
            data-testid={`perm-save-${role.name}`}
          >
            Save permissions
          </Button>
          {dirty && !saving && (
            <Button size="sm" variant="ghost" onClick={() => setDraft(role.permissions)}>
              Reset
            </Button>
          )}
          {feedback && (
            <p
              role={feedback.ok ? 'status' : 'alert'}
              data-testid={`perm-feedback-${role.name}`}
              className={cn('text-sm', feedback.ok ? 'text-status-success' : 'text-status-critical')}
            >
              {feedback.msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
