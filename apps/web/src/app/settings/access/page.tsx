'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Search, SlidersHorizontal, UserCog } from 'lucide-react';

import type { Domain, PermissionKey, Scope } from '@kpi-nexus/contracts';

import { AppShell } from '../../../components/app-shell';
import { PageAccessEditor } from '../../../components/access/page-access-editor';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
} from '../../../components/ui';
import { cn } from '../../../lib/cn';
import {
  ApiError,
  clearTokens,
  deleteAccessOverride,
  getAccessOverride,
  getAccessToken,
  getUserAccessProfile,
  listKpiCategories,
  listUsers,
  upsertAccessOverride,
  type AccessProfile,
  type DataLimitsConfig,
  type KpiCategory,
  type PageAccessConfig,
  type PublicAccessOverride,
  type ScopeConfig,
  type UserAccessOverride,
  type UserSummary,
} from '../../../lib/api-client';
import { PERMISSION_GROUPS, PERMISSION_LABELS } from '../../../lib/permissions';

// -----------------------------------------------------------------------------
// Static maps
// -----------------------------------------------------------------------------

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

type CapState = 'inherit' | 'grant' | 'revoke';

const CAP_OPTIONS: ReadonlyArray<{ value: CapState; label: string }> = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'grant', label: 'Grant' },
  { value: 'revoke', label: 'Revoke' },
];

const TOTAL_CAPS = PERMISSION_GROUPS.reduce((n, g) => n + g.keys.length, 0);

// -----------------------------------------------------------------------------
// Page shell — user list + selection
// -----------------------------------------------------------------------------

export default function AccessCenterPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [categories, setCategories] = useState<KpiCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void (async () => {
      try {
        const [u, cats] = await Promise.all([listUsers(), listKpiCategories().catch(() => [])]);
        setUsers(u);
        setCategories(cats);
        setSelectedId((prev) => prev ?? u[0]?.id ?? null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          clearTokens();
          router.replace('/login');
          return;
        }
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load users');
      }
    })();
  }, [router]);

  const filtered = useMemo(() => {
    if (!users) return null;
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, query]);

  const selectedUser = useMemo(
    () => users?.find((u) => u.id === selectedId) ?? null,
    [users, selectedId],
  );

  return (
    <AppShell title="Access Center" crumbs={['People', 'Access Center']}>
      <RequirePermission permission="USERS_MANAGE">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Access Center"
            titleTestId="access-center-heading"
            subtitle="Preview a user's effective access, then fine-tune it with a per-user override. Admins bypass every check."
          />

          {loadError && (
            <div
              role="alert"
              data-testid="access-load-error"
              className="rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
            >
              {loadError}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[280px_1fr] lg:items-start">
            {/* User list */}
            <Card className="p-3">
              <div className="relative mb-2">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted"
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people…"
                  aria-label="Search people"
                  data-testid="access-user-search"
                  className="pl-8"
                />
              </div>
              {filtered === null ? (
                <div className="flex flex-col gap-2 p-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-content-muted">No people match.</p>
              ) : (
                <ul role="list" className="flex max-h-[70vh] flex-col overflow-y-auto">
                  {filtered.map((u) => {
                    const active = u.id === selectedId;
                    return (
                      <li key={u.id} data-testid={`access-user-${u.id}`}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(u.id)}
                          className={cn(
                            'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors',
                            active ? 'bg-accent-bg text-accent-primary' : 'hover:bg-surface-hover',
                          )}
                        >
                          <span
                            className={cn(
                              'truncate text-sm',
                              active ? 'font-semibold' : 'font-medium text-content-default',
                            )}
                          >
                            {u.fullName}
                          </span>
                          <span className="truncate text-xs text-content-muted">{u.email}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* Detail panel */}
            {selectedUser ? (
              <UserAccessPanel key={selectedUser.id} user={selectedUser} categories={categories} />
            ) : (
              <Card>
                <EmptyState
                  icon={UserCog}
                  title="Select a person"
                  description="Pick someone on the left to review and adjust their access."
                />
              </Card>
            )}
          </div>
        </div>
      </RequirePermission>
    </AppShell>
  );
}

// -----------------------------------------------------------------------------
// Per-user resolved access + override editor
// -----------------------------------------------------------------------------

function UserAccessPanel({ user, categories }: { user: UserSummary; categories: KpiCategory[] }) {
  const [profile, setProfile] = useState<AccessProfile | null>(null);
  const [override, setOverride] = useState<PublicAccessOverride | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Editor state
  const [caps, setCaps] = useState<Record<string, CapState>>({});
  const [scopes, setScopes] = useState<Record<string, string>>({});
  const [limits, setLimits] = useState({ historyWindowDays: '', maxListRows: '', maxExportRows: '' });
  const [restrictCats, setRestrictCats] = useState(false);
  const [catIds, setCatIds] = useState<Set<string>>(new Set());
  // Page access (Layer-5). Held as the latest config the editor emits; reset on
  // (re)hydrate so it tracks the persisted override.
  const [pageAccess, setPageAccess] = useState<PageAccessConfig>({ allow: null, deny: [] });
  // Bump to force the PageAccessEditor to re-mount (re-hydrate) after save/clear.
  const [pageAccessKey, setPageAccessKey] = useState(0);

  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const hydrateEditor = useCallback((ov: PublicAccessOverride | null) => {
    const c: Record<string, CapState> = {};
    for (const g of PERMISSION_GROUPS) for (const k of g.keys) c[k] = 'inherit';
    for (const k of ov?.grantCapabilities ?? []) c[k] = 'grant';
    for (const k of ov?.revokeCapabilities ?? []) c[k] = 'revoke';
    setCaps(c);

    const s: Record<string, string> = {};
    for (const d of DOMAINS) s[d.key] = ov?.scopeConfig?.[d.key] ?? '';
    setScopes(s);

    setLimits({
      historyWindowDays: ov?.dataLimits?.historyWindowDays != null ? String(ov.dataLimits.historyWindowDays) : '',
      maxListRows: ov?.dataLimits?.maxListRows != null ? String(ov.dataLimits.maxListRows) : '',
      maxExportRows: ov?.dataLimits?.maxExportRows != null ? String(ov.dataLimits.maxExportRows) : '',
    });

    const kc = ov?.dataTypeConfig?.kpiCategoryIds;
    setRestrictCats(Array.isArray(kc));
    setCatIds(new Set(Array.isArray(kc) ? kc : []));

    setPageAccess({ allow: ov?.pageAccess?.allow ?? null, deny: ov?.pageAccess?.deny ?? [] });
    setPageAccessKey((k) => k + 1);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const [p, ov] = await Promise.all([getUserAccessProfile(user.id), getAccessOverride(user.id)]);
      setProfile(p);
      setOverride(ov);
      hydrateEditor(ov);
    } catch (err) {
      setLoadErr(err instanceof ApiError ? err.message : 'Failed to load access');
    } finally {
      setLoading(false);
    }
  }, [user.id, hydrateEditor]);

  useEffect(() => {
    void load();
  }, [load]);

  function buildPayload(): UserAccessOverride {
    const grantCapabilities: PermissionKey[] = [];
    const revokeCapabilities: PermissionKey[] = [];
    for (const [k, v] of Object.entries(caps)) {
      if (v === 'grant') grantCapabilities.push(k as PermissionKey);
      else if (v === 'revoke') revokeCapabilities.push(k as PermissionKey);
    }

    const scopeConfig: ScopeConfig = {};
    for (const d of DOMAINS) {
      const v = scopes[d.key];
      if (v) scopeConfig[d.key] = v as Scope;
    }

    const toPos = (s: string): number | undefined => {
      const t = s.trim();
      // Reject anything that isn't a pure positive integer. parseInt would
      // silently truncate "90abc"/"100.5"/"1e9" to a wrong value (90/100/1),
      // corrupting the saved limit; a non-integer entry is treated as "inherit".
      if (!/^\d+$/.test(t)) return undefined;
      const n = Number.parseInt(t, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const dl: DataLimitsConfig = {};
    const h = toPos(limits.historyWindowDays);
    if (h !== undefined) dl.historyWindowDays = h;
    const l = toPos(limits.maxListRows);
    if (l !== undefined) dl.maxListRows = l;
    const e = toPos(limits.maxExportRows);
    if (e !== undefined) dl.maxExportRows = e;

    return {
      grantCapabilities,
      revokeCapabilities,
      scopeConfig: Object.keys(scopeConfig).length > 0 ? scopeConfig : undefined,
      dataTypeConfig: restrictCats ? { kpiCategoryIds: [...catIds] } : undefined,
      dataLimits: Object.keys(dl).length > 0 ? dl : undefined,
      // Always send pageAccess (the editor already shapes it to
      // { allow: restrictOn ? [...] : null, deny: [...] }) so clearing works.
      pageAccess,
    };
  }

  async function reprofile() {
    const p = await getUserAccessProfile(user.id);
    setProfile(p);
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const ov = await upsertAccessOverride(user.id, buildPayload());
      setOverride(ov);
      hydrateEditor(ov);
      await reprofile();
      setSaveMsg('Override saved — resolved access updated.');
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : 'Failed to save override');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      await deleteAccessOverride(user.id);
      setOverride(null);
      hydrateEditor(null);
      await reprofile();
      setSaveMsg('Override cleared — reverted to role access.');
    } catch (err) {
      setSaveErr(err instanceof ApiError ? err.message : 'Failed to clear override');
    } finally {
      setClearing(false);
    }
  }

  const categoryName = useCallback(
    (id: string) => categories.find((c) => c.id === id)?.name ?? id,
    [categories],
  );

  const summary = useMemo(() => (profile ? summarize(profile, categoryName) : []), [profile, categoryName]);
  const busy = saving || clearing;

  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </Card>
    );
  }

  if (loadErr || !profile) {
    return (
      <Card className="p-5">
        <p role="alert" className="text-sm text-status-critical">
          {loadErr ?? 'No access profile available.'}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Resolved access */}
      <Card className="p-5" data-testid="resolved-access">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-content-strong">
              Resolved access · {user.fullName}
            </h2>
            <p className="mt-0.5 text-xs text-content-muted">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            {profile.isAdmin && <Badge tone="info">admin</Badge>}
            {override ? (
              <Badge tone="warning" data-testid="override-active-badge">
                override active
              </Badge>
            ) : (
              <Badge tone="neutral">role access</Badge>
            )}
          </div>
        </div>

        {profile.isAdmin && (
          <p
            role="note"
            className="mt-3 rounded-lg border border-status-info/30 bg-status-info-bg px-3 py-2 text-xs text-status-info"
          >
            This user is an administrator and bypasses every permission, scope, and data-limit
            check — any override below is stored but has no effect while they remain an admin.
          </p>
        )}

        {/* Plain-language summary */}
        <ul className="mt-3 flex flex-col gap-1" data-testid="access-summary">
          {summary.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-content-default">
              <Check aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-primary" />
              {line}
            </li>
          ))}
        </ul>

        {/* Capability matrix (read-only) */}
        <div className="mt-5 flex flex-col gap-4">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.heading}>
              <div className="kn-eyebrow mb-2">{g.heading}</div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {g.keys.map((key) => {
                  const on = profile.isAdmin || profile.capabilities.includes(key);
                  return (
                    <span key={key} className="inline-flex w-44 items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'flex shrink-0 items-center justify-center rounded',
                          on
                            ? 'bg-accent-primary text-white'
                            : 'border border-border-strong bg-surface-bg text-transparent',
                        )}
                        style={{ width: 18, height: 18 }}
                      >
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      <span className="text-sm text-content-default">{PERMISSION_LABELS[key]}</span>
                      <span className="sr-only">{on ? 'granted' : 'not granted'}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Scope per domain */}
        <div className="mt-5">
          <div className="kn-eyebrow mb-2">Whose data (scope)</div>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((d) => {
              const sc = profile.isAdmin ? 'ORG' : profile.scopeByDomain[d.key] ?? 'ORG';
              return (
                <span
                  key={d.key}
                  className="inline-flex items-center gap-1.5 rounded-md bg-surface-1 px-2 py-1 text-xs"
                >
                  <span className="text-content-muted">{d.label}</span>
                  <span className="font-medium text-content-strong">{SCOPE_LABELS[sc]}</span>
                </span>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Override editor */}
      <Card className="p-5" data-testid="override-editor">
        <div className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden className="h-4 w-4 text-content-muted" />
          <h2 className="text-sm font-semibold text-content-strong">Per-user override</h2>
        </div>
        <p className="mt-1 text-xs text-content-muted">
          Each field <em>replaces</em> the role value for this user. Leave on <strong>Inherit</strong> /
          blank to keep the role default. Revoking a capability wins over granting it.
        </p>

        {/* Capabilities */}
        <div className="mt-5 flex flex-col gap-4">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.heading}>
              <div className="kn-eyebrow mb-2">{g.heading}</div>
              <div className="flex flex-col gap-2">
                {g.keys.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-content-default">{PERMISSION_LABELS[key]}</span>
                    <Segmented
                      aria-label={`${PERMISSION_LABELS[key]} override`}
                      options={CAP_OPTIONS}
                      value={caps[key] ?? 'inherit'}
                      onChange={(v) => setCaps((prev) => ({ ...prev, [key]: v }))}
                      className="shrink-0"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Scope per domain */}
        <div className="mt-6">
          <div className="kn-eyebrow mb-2">Whose data (scope)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {DOMAINS.map((d) => (
              <div key={d.key} className="flex items-center justify-between gap-3">
                <Label htmlFor={`scope-${d.key}`} className="text-sm font-normal text-content-default">
                  {d.label}
                </Label>
                <Select
                  id={`scope-${d.key}`}
                  value={scopes[d.key] ?? ''}
                  onChange={(e) => setScopes((prev) => ({ ...prev, [d.key]: e.target.value }))}
                  className="w-44"
                >
                  <option value="">Inherit</option>
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
          <div className="kn-eyebrow mb-2">How much / how old (blank = inherit)</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lim-history">History window (days)</Label>
              <Input
                id="lim-history"
                type="number"
                min={1}
                value={limits.historyWindowDays}
                onChange={(e) => setLimits((p) => ({ ...p, historyWindowDays: e.target.value }))}
                placeholder="Unlimited"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lim-list">Max list rows</Label>
              <Input
                id="lim-list"
                type="number"
                min={1}
                value={limits.maxListRows}
                onChange={(e) => setLimits((p) => ({ ...p, maxListRows: e.target.value }))}
                placeholder="Unlimited"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lim-export">Max export rows</Label>
              <Input
                id="lim-export"
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
              data-testid="restrict-categories-toggle"
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
                  <p role="alert" className="text-xs text-status-warning" data-testid="empty-categories-warning">
                    No categories selected — saving will hide every categorised KPI from this user.
                  </p>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {categories.map((c) => (
                    <label key={c.id} className="inline-flex items-center gap-2 text-sm text-content-default">
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
        <PageAccessEditor
          key={pageAccessKey}
          value={override?.pageAccess ?? null}
          onChange={setPageAccess}
        />

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border-divider pt-4">
          <Button onClick={() => void handleSave()} isLoading={saving} disabled={busy} data-testid="save-override">
            {saving ? 'Saving…' : 'Save override'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void handleClear()}
            disabled={busy || !override}
            className="text-status-critical hover:bg-status-critical/10"
            data-testid="clear-override"
          >
            {clearing ? 'Clearing…' : 'Clear override'}
          </Button>
          {saveErr && (
            <p role="alert" className="text-sm text-status-critical" data-testid="override-error">
              {saveErr}
            </p>
          )}
          {saveMsg && (
            <p role="status" className="text-sm text-status-success" data-testid="override-success">
              {saveMsg}
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Plain-language summary
// -----------------------------------------------------------------------------

function summarize(p: AccessProfile, categoryName: (id: string) => string): string[] {
  if (p.isAdmin) {
    return ['Administrator — bypasses every permission, scope, and data-limit check.'];
  }
  const lines: string[] = [];
  lines.push(`${p.capabilities.length} of ${TOTAL_CAPS} capabilities granted.`);
  lines.push(`Sees KPI data for: ${SCOPE_LABELS[p.scopeByDomain.KPIS ?? 'ORG']}.`);

  const dl = p.dataLimits;
  if (dl.historyWindowDays) lines.push(`History limited to the last ${dl.historyWindowDays} days.`);
  if (dl.maxListRows) lines.push(`KPI lists capped at ${dl.maxListRows.toLocaleString()} rows.`);
  if (dl.maxExportRows) lines.push(`Exports capped at ${dl.maxExportRows.toLocaleString()} rows.`);

  const kc = p.dataTypeFilters.kpiCategoryIds;
  if (Array.isArray(kc)) {
    if (kc.length === 0) {
      lines.push('Cannot see any categorised KPIs.');
    } else {
      const names = kc.slice(0, 3).map(categoryName).join(', ');
      lines.push(
        `Restricted to ${kc.length} KPI categor${kc.length === 1 ? 'y' : 'ies'}${
          names ? ` (${names}${kc.length > 3 ? '…' : ''})` : ''
        }.`,
      );
    }
  }
  return lines;
}
