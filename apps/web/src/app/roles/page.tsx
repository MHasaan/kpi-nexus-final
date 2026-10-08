'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Plus, ShieldCheck } from 'lucide-react';

import type { Domain, Scope } from '@kpi-nexus/contracts';

import { AppShell } from '../../components/app-shell';
import { PageAccessEditor } from '../../components/access/page-access-editor';
import { PermissionGuard } from '../../components/auth/permission-guard';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
} from '../../components/ui';
import { cn } from '../../lib/cn';
import {
  ApiError,
  applyRolePreset,
  clearTokens,
  createRole,
  deleteRole,
  getAccessToken,
  listKpiCategories,
  listPermissionPresets,
  listRoles,
  updateRole,
  type DataLimitsConfig,
  type DataTypeConfig,
  type KpiCategory,
  type PageAccessConfig,
  type RolePreset,
  type RoleSummary,
  type ScopeConfig,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';
import { currentLoginRedirect } from '../../lib/auth-redirect';
import { usePermissions } from '../../lib/use-permissions';

// Grouped view of the 18 canonical permissions (mirrors the design's matrix).
const PERM_GROUPS: Array<[string, Array<[string, string]>]> = [
  [
    'KPIs',
    [
      ['View', 'KPI_VIEW'],
      ['Create', 'KPI_CREATE'],
      ['Edit', 'KPI_EDIT'],
      ['Delete', 'KPI_DELETE'],
      ['Data entry', 'KPI_DATA_ENTRY'],
    ],
  ],
  [
    'Dashboards',
    [
      ['View', 'DASHBOARD_VIEW'],
      ['Manage', 'DASHBOARD_MANAGE'],
    ],
  ],
  [
    'Users & RBAC',
    [
      ['Users view', 'USERS_VIEW'],
      ['Users manage', 'USERS_MANAGE'],
      ['Roles manage', 'ROLES_MANAGE'],
    ],
  ],
  [
    'Org',
    [
      ['Positions', 'POSITIONS_MANAGE'],
      ['Groups view', 'GROUPS_VIEW'],
      ['Groups manage', 'GROUPS_MANAGE'],
    ],
  ],
  [
    'Intelligence',
    [
      ['Alerts', 'ALERTS_VIEW'],
      ['Insights', 'INSIGHTS_VIEW'],
      ['Analytics', 'ANALYTICS_VIEW'],
      ['Reports', 'REPORTS_VIEW'],
    ],
  ],
  [
    'Admin',
    [['Org settings', 'ORG_SETTINGS']],
  ],
];

const ROLE_DOT = [
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
  'bg-chart-6',
  'bg-chart-7',
];

// Per-domain scope + labels — mirrors the per-user override editor (Access Center).
const DOMAINS: ReadonlyArray<{ key: Domain; label: string }> = [
  { key: 'KPIS', label: 'KPIs' },
  { key: 'DASHBOARDS', label: 'Dashboards' },
  { key: 'ALERTS', label: 'Alerts' },
  { key: 'REPORTS', label: 'Reports' },
  { key: 'ANALYTICS', label: 'Analytics' },
  { key: 'INSIGHTS', label: 'Insights' },
  { key: 'OKRS', label: 'OKRs' },
  { key: 'TASKS', label: 'Tasks' },
  { key: 'PEOPLE', label: 'People' },
  { key: 'ORG', label: 'Org' },
];

const SCOPE_LABELS: Record<Scope, string> = {
  SELF: 'Self only',
  DIRECT_REPORTS: 'Direct reports',
  UNITS: 'Their units',
  ORG: 'Whole org',
};

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
  const [categories, setCategories] = useState<KpiCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Create-role form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Per-row delete in-flight tracking
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Presets
  const [presets, setPresets] = useState<RolePreset[]>([]);
  const { ready: permsReady, has } = usePermissions();
  // Presets are a ROLES_MANAGE resource (FE-014): only load them for users who can.
  const canManageRoles = permsReady && has('ROLES_MANAGE');
  useEffect(() => {
    if (!canManageRoles) return;
    listPermissionPresets()
      .then(setPresets)
      .catch(() => {
        /* non-fatal — preset UI degrades gracefully */
      });
  }, [canManageRoles]);

  const [selectedPreset, setSelectedPreset] = useState<Record<string, string>>({});
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<
    Record<string, { ok: boolean; msg: string }>
  >({});

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    refresh();
    listKpiCategories()
      .then(setCategories)
      .catch(() => {
        /* non-fatal — category restriction UI degrades gracefully */
      });
  }, [router]);

  // Patch a single role in local state after a config save (so re-selecting it
  // shows persisted values without a full refetch).
  const handleRoleUpdated = useCallback((updated: RoleSummary) => {
    setRoles((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
  }, []);

  async function refresh() {
    setLoadError(null);
    try {
      const data = await listRoles();
      setRoles(data);
      setSelectedRoleId((prev) => prev ?? data[0]?.id ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
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
      setShowCreate(false);
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
      if (selectedRoleId === role.id) setSelectedRoleId(null);
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
        [role.id]: {
          ok: true,
          msg: `Preset applied — ${presets.find((p) => p.key === preset)?.label ?? preset}`,
        },
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

  const selectedRole = useMemo(
    () => roles?.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  return (
    <AppShell title={pluralize(terminology.roleLabel)} crumbs={['People', pluralize(terminology.roleLabel)]}>
      <RequirePermission permission="ROLES_MANAGE">
        <div className="flex flex-col gap-6">
          <PageHeader
            title={pluralize(terminology.roleLabel)}
            titleTestId="roles-heading"
            subtitle="18 canonical permissions · admin bypasses all checks · inherited shown derived"
            actions={
              <PermissionGuard permission="ROLES_MANAGE">
                <Button
                  leftIcon={<Plus aria-hidden className="h-4 w-4" />}
                  onClick={() => setShowCreate((v) => !v)}
                >
                  New {terminology.roleLabel.toLowerCase()}
                </Button>
              </PermissionGuard>
            }
          />

          {loadError && (
            <div
              role="alert"
              data-testid="roles-load-error"
              className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              {loadError}
            </div>
          )}
          {deleteError && (
            <div
              role="alert"
              className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              {deleteError}
            </div>
          )}

          <PermissionGuard permission="ROLES_MANAGE">
            {showCreate && (
              <Card>
                <div className="border-b border-border-divider px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-content-strong">
                    Create a {terminology.roleLabel.toLowerCase()}
                  </h2>
                  <p className="mt-1 text-xs text-content-muted">
                    Permissions can be added after creation (apply a preset below).
                  </p>
                </div>
                <form
                  onSubmit={handleCreate}
                  className="grid gap-4 p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="role-name" required>
                      Name
                    </Label>
                    <Input
                      id="role-name"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      disabled={creating}
                      placeholder="e.g. Field Engineer"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="role-desc">Description</Label>
                    <Input
                      id="role-desc"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      disabled={creating}
                      placeholder="Optional"
                    />
                  </div>
                  <Button type="submit" isLoading={creating}>
                    {creating ? 'Creating…' : 'Create'}
                  </Button>
                  {createError && (
                    <p role="alert" className="text-sm text-status-critical sm:col-span-3">
                      {createError}
                    </p>
                  )}
                </form>
              </Card>
            )}
          </PermissionGuard>

          {roles === null && !loadError ? (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
              <Card>
                <div className="flex flex-col gap-2 p-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </Card>
              <Card>
                <Skeleton className="m-4 h-64" />
              </Card>
            </div>
          ) : roles && roles.length === 0 ? (
            <Card>
              <EmptyState
                icon={ShieldCheck}
                title="No roles yet"
                description={`Create your first ${terminology.roleLabel.toLowerCase()} above.`}
              />
            </Card>
          ) : roles ? (
            <div className="grid gap-4 lg:grid-cols-[260px_1fr] lg:items-start">
              {/* Roles list */}
              <Card className="p-2">
                <ul role="list" className="flex flex-col">
                  {roles.map((role, i) => {
                    const active = role.id === selectedRoleId;
                    return (
                      <li key={role.id} data-testid={`role-row-${role.name}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedRoleId(role.id)}
                          className={cn(
                            'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                            active
                              ? 'bg-accent-bg text-accent-primary'
                              : 'hover:bg-surface-hover',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'h-2.5 w-2.5 shrink-0 rounded-sm',
                              ROLE_DOT[i % ROLE_DOT.length],
                            )}
                          />
                          <span
                            className={cn(
                              'flex-1 truncate text-sm',
                              active ? 'font-semibold' : 'font-medium text-content-default',
                            )}
                          >
                            {role.name}
                          </span>
                          {role.isAdmin && (
                            <Badge tone="info" className="text-[10px]">
                              admin
                            </Badge>
                          )}
                          <span
                            className="text-xs tabular-nums text-content-muted"
                            title={`${role.permissions.length} permissions`}
                          >
                            {role.permissions.length}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {/* Permission matrix for the selected role */}
              {selectedRole && (
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-content-strong">
                        Permission matrix · {selectedRole.name}
                        {selectedRole.isAdmin && (
                          <Badge tone="info" className="ml-2 align-middle">
                            admin
                          </Badge>
                        )}
                      </h2>
                      <p className="mt-1 max-w-xl text-xs text-content-muted">
                        {selectedRole.isAdmin
                          ? 'Admin roles bypass every permission check.'
                          : 'Resolver order: isAdmin → resource → role → inherited → delegation → owner. Permission changes may be approval-gated.'}
                      </p>
                    </div>
                    <PermissionGuard permission="ROLES_MANAGE">
                      <div className="flex flex-wrap items-center gap-2">
                        {presets.length > 0 && (
                          <>
                            <Select
                              value={selectedPreset[selectedRole.id] ?? ''}
                              onChange={(e) =>
                                setSelectedPreset((prev) => ({
                                  ...prev,
                                  [selectedRole.id]: e.target.value,
                                }))
                              }
                              disabled={applyingId === selectedRole.id}
                              aria-label={`Select preset for ${selectedRole.name}`}
                              data-testid={`preset-select-${selectedRole.name}`}
                              className="w-44"
                            >
                              <option value="">Apply preset…</option>
                              {presets.map((p) => (
                                <option key={p.key} value={p.key}>
                                  {p.label}
                                </option>
                              ))}
                            </Select>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleApplyPreset(selectedRole)}
                              disabled={
                                !selectedPreset[selectedRole.id] ||
                                applyingId === selectedRole.id
                              }
                              aria-label={`Apply preset to ${selectedRole.name}`}
                              data-testid={`preset-apply-${selectedRole.name}`}
                            >
                              {applyingId === selectedRole.id ? 'Applying…' : 'Apply'}
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(selectedRole)}
                          disabled={deletingId === selectedRole.id}
                          className="text-status-critical hover:bg-status-critical/10"
                          aria-label={`Delete ${selectedRole.name}`}
                        >
                          {deletingId === selectedRole.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </PermissionGuard>
                  </div>

                  {applyFeedback[selectedRole.id] && (
                    <p
                      role="status"
                      data-testid={`preset-feedback-${selectedRole.name}`}
                      className={cn(
                        'mt-2 text-sm',
                        applyFeedback[selectedRole.id]?.ok
                          ? 'text-status-success'
                          : 'text-status-critical',
                      )}
                    >
                      {applyFeedback[selectedRole.id]?.msg}
                    </p>
                  )}

                  <div className="mt-5 flex flex-col gap-5">
                    {PERM_GROUPS.map(([group, perms]) => (
                      <div key={group}>
                        <div className="kn-eyebrow mb-2.5">{group}</div>
                        <div className="flex flex-wrap gap-x-6 gap-y-2.5">
                          {perms.map(([label, key]) => {
                            const on =
                              selectedRole.isAdmin || selectedRole.permissions.includes(key);
                            return (
                              <span
                                key={key}
                                className="inline-flex w-40 items-center gap-2"
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded',
                                    on
                                      ? 'bg-accent-primary text-white'
                                      : 'border border-border-strong bg-surface-bg text-transparent',
                                  )}
                                  style={{ width: 18, height: 18 }}
                                >
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </span>
                                <span className="text-sm text-content-default">{label}</span>
                                <span className="sr-only">
                                  {on ? 'granted' : 'not granted'}
                                </span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {selectedRole.description && (
                    <p className="mt-5 border-t border-border-divider pt-4 text-sm text-content-muted">
                      {selectedRole.description}
                    </p>
                  )}

                  <RoleAccessConfig
                    key={selectedRole.id}
                    role={selectedRole}
                    categories={categories}
                    onSaved={handleRoleUpdated}
                  />
                </Card>
              )}
            </div>
          ) : null}
        </div>
      </RequirePermission>
    </AppShell>
  );
}

// -----------------------------------------------------------------------------
// Per-role scope / data-limits / KPI-category config editor (Phase 6b)
// Mirrors the per-user override editor (Access Center). Keyed by role id so it
// re-mounts (and re-hydrates) cleanly when a different role is selected.
// -----------------------------------------------------------------------------

function RoleAccessConfig({
  role,
  categories,
  onSaved,
}: {
  role: RoleSummary;
  categories: KpiCategory[];
  onSaved: (role: RoleSummary) => void;
}) {
  // Editor state — hydrated once from the role on mount (component is keyed by id).
  const [scopes, setScopes] = useState<Record<string, string>>(() => {
    const s: Record<string, string> = {};
    for (const d of DOMAINS) s[d.key] = role.scopeConfig?.[d.key] ?? '';
    return s;
  });
  const [limits, setLimits] = useState(() => ({
    historyWindowDays:
      role.dataLimits?.historyWindowDays != null ? String(role.dataLimits.historyWindowDays) : '',
    maxListRows: role.dataLimits?.maxListRows != null ? String(role.dataLimits.maxListRows) : '',
    maxExportRows:
      role.dataLimits?.maxExportRows != null ? String(role.dataLimits.maxExportRows) : '',
  }));
  const [restrictCats, setRestrictCats] = useState(() =>
    Array.isArray(role.dataTypeConfig?.kpiCategoryIds),
  );
  const [catIds, setCatIds] = useState<Set<string>>(() => {
    const kc = role.dataTypeConfig?.kpiCategoryIds;
    return new Set(Array.isArray(kc) ? kc : []);
  });
  // Page access (Layer-5). Initialize from the role so an untouched block still
  // round-trips the persisted value on Save; the editor overwrites it on change.
  const [pageAccess, setPageAccess] = useState<PageAccessConfig>(() => ({
    allow: role.pageAccess?.allow ?? null,
    deny: role.pageAccess?.deny ?? [],
  }));

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  function buildPayload(): {
    scopeConfig: ScopeConfig;
    dataTypeConfig: DataTypeConfig;
    dataLimits: DataLimitsConfig;
    pageAccess: PageAccessConfig;
  } {
    // Scope: only non-empty (non-inherit) entries; {} clears the role's scope config.
    const scopeConfig: ScopeConfig = {};
    for (const d of DOMAINS) {
      const v = scopes[d.key];
      if (v) scopeConfig[d.key] = v as Scope;
    }

    // Strict positive-integer parse (shared 6a semantics). parseInt would silently
    // truncate "90abc"/"100.5"/"1e9" to a wrong value — treat non-integers as unset.
    const toPos = (s: string): number | undefined => {
      const t = s.trim();
      if (!/^\d+$/.test(t)) return undefined;
      const n = Number.parseInt(t, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const dataLimits: DataLimitsConfig = {};
    const h = toPos(limits.historyWindowDays);
    if (h !== undefined) dataLimits.historyWindowDays = h;
    const l = toPos(limits.maxListRows);
    if (l !== undefined) dataLimits.maxListRows = l;
    const e = toPos(limits.maxExportRows);
    if (e !== undefined) dataLimits.maxExportRows = e;

    // Category allowlist: restrict on ⇒ { kpiCategoryIds: [...] }; off ⇒ {} which
    // (no kpiCategoryIds key) resolves to null server-side, i.e. no restriction.
    const dataTypeConfig: DataTypeConfig = restrictCats ? { kpiCategoryIds: [...catIds] } : {};

    // Always send pageAccess reflecting the block state so { allow:null, deny:[] }
    // clears any prior restriction.
    return { scopeConfig, dataTypeConfig, dataLimits, pageAccess };
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const updated = await updateRole(role.id, buildPayload());
      onSaved(updated);
      setSaveMsg('Access config saved.');
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : 'Failed to save access config');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="role-access-config"
      className="mt-6 border-t border-border-divider pt-5"
    >
      <h3 className="text-sm font-semibold text-content-strong">Access config</h3>
      <p className="mt-1 max-w-xl text-xs text-content-muted">
        Default scope, data limits, and KPI-category allowlist applied to everyone with this{' '}
        role. Per-user overrides (Access Center) replace these per field.
      </p>

      {role.isAdmin && (
        <p
          role="note"
          className="mt-3 rounded-lg border border-status-info/30 bg-status-info-bg px-3 py-2 text-xs text-status-info"
        >
          Admin roles bypass every permission, scope, and data-limit check — this config is stored
          but has no effect while the role stays admin.
        </p>
      )}

      {/* Scope per domain */}
      <div className="mt-5">
        <div className="kn-eyebrow mb-2">Whose data (scope)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOMAINS.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-3">
              <Label
                htmlFor={`role-scope-${d.key}`}
                className="text-sm font-normal text-content-default"
              >
                {d.label}
              </Label>
              <Select
                id={`role-scope-${d.key}`}
                value={scopes[d.key] ?? ''}
                onChange={(e) => setScopes((prev) => ({ ...prev, [d.key]: e.target.value }))}
                className="w-44"
              >
                <option value="">Default (inherit)</option>
                <option value="SELF">{SCOPE_LABELS.SELF}</option>
                <option value="DIRECT_REPORTS">{SCOPE_LABELS.DIRECT_REPORTS}</option>
                <option value="UNITS">{SCOPE_LABELS.UNITS}</option>
                <option value="ORG">{SCOPE_LABELS.ORG}</option>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Data limits */}
      <div className="mt-6">
        <div className="kn-eyebrow mb-2">How much / how old (blank = unset)</div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-lim-history">History window (days)</Label>
            <Input
              id="role-lim-history"
              type="number"
              min={1}
              value={limits.historyWindowDays}
              onChange={(e) => setLimits((p) => ({ ...p, historyWindowDays: e.target.value }))}
              placeholder="Unlimited"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-lim-list">Max list rows</Label>
            <Input
              id="role-lim-list"
              type="number"
              min={1}
              value={limits.maxListRows}
              onChange={(e) => setLimits((p) => ({ ...p, maxListRows: e.target.value }))}
              placeholder="Unlimited"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="role-lim-export">Max export rows</Label>
            <Input
              id="role-lim-export"
              type="number"
              min={1}
              value={limits.maxExportRows}
              onChange={(e) => setLimits((p) => ({ ...p, maxExportRows: e.target.value }))}
              placeholder="Unlimited"
            />
          </div>
        </div>
      </div>

      {/* Category filter */}
      <div className="mt-6">
        <label className="flex items-center gap-2 text-sm font-medium text-content-strong">
          <input
            type="checkbox"
            checked={restrictCats}
            onChange={(e) => setRestrictCats(e.target.checked)}
            data-testid="role-restrict-categories-toggle"
            className="h-4 w-4 rounded border-border-strong accent-accent-primary"
          />
          Restrict to specific KPI categories
        </label>
        {restrictCats &&
          (categories.length === 0 ? (
            <p className="mt-2 text-xs text-content-muted">
              No KPI categories defined yet — saving with this on will hide all categorised KPIs.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {catIds.size === 0 && (
                <p
                  role="alert"
                  className="text-xs text-status-warning"
                  data-testid="role-empty-categories-warning"
                >
                  No categories selected — saving will hide every categorised KPI from this role.
                </p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {categories.map((c) => (
                  <label
                    key={c.id}
                    className="inline-flex items-center gap-2 text-sm text-content-default"
                  >
                    <input
                      type="checkbox"
                      checked={catIds.has(c.id)}
                      onChange={(e) =>
                        setCatIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(c.id);
                          else next.delete(c.id);
                          return next;
                        })
                      }
                      className="h-4 w-4 rounded border-border-strong accent-accent-primary"
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Page access (Layer-5) */}
      <PageAccessEditor value={role.pageAccess} onChange={setPageAccess} />

      {/* Actions */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => void handleSave()}
          isLoading={saving}
          disabled={saving}
          data-testid="save-role-config"
        >
          {saving ? 'Saving…' : 'Save access config'}
        </Button>
        {saveErr && (
          <p role="alert" className="text-sm text-status-critical" data-testid="role-config-error">
            {saveErr}
          </p>
        )}
        {saveMsg && (
          <p role="status" className="text-sm text-status-success" data-testid="role-config-success">
            {saveMsg}
          </p>
        )}
      </div>
    </div>
  );
}
