'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  ApiError,
  applyRolePreset,
  clearTokens,
  createRole,
  deleteRole,
  getAccessToken,
  listPermissionPresets,
  listRoles,
  type RolePreset,
  type RoleSummary,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function RolesPage() {
  return (
    <TerminologyProvider>
      <RolesPageInner />
    </TerminologyProvider>
  );
}

function RolesPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create-role form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Per-row delete in-flight tracking
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Presets
  const [presets, setPresets] = useState<RolePreset[]>([]);
  // Per-row preset selection: roleId → selected preset key
  const [selectedPreset, setSelectedPreset] = useState<Record<string, string>>({});
  // Per-row apply in-flight
  const [applyingId, setApplyingId] = useState<string | null>(null);
  // Per-row success/error feedback: roleId → message
  const [applyFeedback, setApplyFeedback] = useState<Record<string, { ok: boolean; msg: string }>>({});

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    refresh();
    listPermissionPresets()
      .then(setPresets)
      .catch(() => { /* non-fatal — preset UI degrades gracefully */ });
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const data = await listRoles();
      setRoles(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load roles');
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await createRole({
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setNewName('');
      setNewDescription('');
      await refresh();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create role');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(role: RoleSummary) {
    setDeletingId(role.id);
    setDeleteError(null);
    try {
      await deleteRole(role.id);
      await refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : `Failed to delete ${role.name}`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  async function handleApplyPreset(role: RoleSummary) {
    const preset = selectedPreset[role.id];
    if (!preset) return;
    setApplyingId(role.id);
    setApplyFeedback((prev) => {
      const next = { ...prev };
      delete next[role.id];
      return next;
    });
    try {
      await applyRolePreset(role.id, preset);
      await refresh();
      setApplyFeedback((prev) => ({
        ...prev,
        [role.id]: { ok: true, msg: `Preset applied — ${presets.find((p) => p.key === preset)?.label ?? preset}` },
      }));
    } catch (err) {
      setApplyFeedback((prev) => ({
        ...prev,
        [role.id]: {
          ok: false,
          msg: err instanceof ApiError ? err.message : 'Failed to apply preset',
        },
      }));
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <AppShell>
      <RequirePermission permission="ROLES_MANAGE">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold text-content-strong"
            data-testid="roles-heading"
          >
            {pluralize(terminology.roleLabel)}
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Manage who can do what. Admin bypasses all permission checks; other
            {' '}{pluralize(terminology.roleLabel.toLowerCase())} get exactly the
            permissions listed.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <PermissionGuard permission="ROLES_MANAGE">
        <section className="mb-8 rounded-lg border border-border bg-surface-1 p-6">
          <h2 className="text-lg font-semibold text-content-strong">Create a role</h2>
          <p className="mt-1 text-sm text-content-muted">
            Permissions can be added after creation (P1 keeps the form minimal).
          </p>
          <form onSubmit={handleCreate} className="mt-4 grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <label className="block">
              <span className="text-sm font-medium text-content-default">Name</span>
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="e.g. Field Engineer"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Description</span>
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                disabled={creating}
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
                placeholder="Optional"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create role'}
            </button>
          </form>
          {createError && (
            <p role="alert" className="mt-3 text-sm text-status-critical">
              {createError}
            </p>
          )}
        </section>
        </PermissionGuard>

        {deleteError && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {deleteError}
          </div>
        )}

        <section>
          {roles === null && !loadError && (
            <p className="text-sm text-content-muted">Loading roles…</p>
          )}
          {roles && (
            <ul className="space-y-3">
              {roles.map((role) => (
                <li
                  key={role.id}
                  className="rounded-lg border border-border bg-surface-1 p-4"
                  data-testid={`role-row-${role.name}`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-content-strong">
                          {role.name}
                          {role.isAdmin && (
                            <span className="ml-2 rounded bg-accent-primary/10 px-1.5 py-0.5 text-xs font-medium text-accent-primary">
                              admin
                            </span>
                          )}
                        </h3>
                        {role.description && (
                          <p className="mt-1 text-sm text-content-muted">{role.description}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {role.permissions.length === 0 && (
                            <span className="text-xs text-content-muted">
                              {role.isAdmin ? 'all permissions (bypass)' : 'no permissions'}
                            </span>
                          )}
                          {role.permissions.map((perm) => (
                            <span
                              key={perm}
                              className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-content-default"
                            >
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                      <PermissionGuard permission="ROLES_MANAGE">
                      <div className="flex flex-wrap items-center gap-2">
                        {presets.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={selectedPreset[role.id] ?? ''}
                              onChange={(e) =>
                                setSelectedPreset((prev) => ({ ...prev, [role.id]: e.target.value }))
                              }
                              disabled={applyingId === role.id}
                              aria-label={`Select preset for ${role.name}`}
                              data-testid={`preset-select-${role.name}`}
                              className="rounded-md border border-border bg-surface-bg px-2 py-1.5 text-sm text-content-strong focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <option value="">Apply preset…</option>
                              {presets.map((p) => (
                                <option key={p.key} value={p.key}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleApplyPreset(role)}
                              disabled={!selectedPreset[role.id] || applyingId === role.id}
                              aria-label={`Apply preset to ${role.name}`}
                              data-testid={`preset-apply-${role.name}`}
                              className="rounded-md border border-border px-3 py-1.5 text-sm text-content-default transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {applyingId === role.id ? 'Applying…' : 'Apply'}
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(role)}
                          disabled={deletingId === role.id}
                          className="rounded-md border border-border px-3 py-1.5 text-sm text-status-critical transition hover:bg-status-critical/10 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${role.name}`}
                        >
                          {deletingId === role.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                      </PermissionGuard>
                    </div>
                    {applyFeedback[role.id] && (
                      <p
                        role="status"
                        data-testid={`preset-feedback-${role.name}`}
                        className={`text-sm ${applyFeedback[role.id]?.ok ? 'text-status-ok' : 'text-status-critical'}`}
                      >
                        {applyFeedback[role.id]?.msg}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      </RequirePermission>
    </AppShell>
  );
}
