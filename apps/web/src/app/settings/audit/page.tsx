'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  downloadAuditCsv,
  getAccessToken,
  listAudit,
  type AuditAction,
  type AuditEntry,
} from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { RequireAnyPermission } from '../../../components/auth/require-permission';
import { usePermissions } from '../../../lib/use-permissions';

/** The keys the audit API accepts — either one (UI-013: the page asked for ORG_SETTINGS only, so an auditor's sidebar link led to "no access"). */
const AUDIT_KEYS = ['AUDIT_VIEW', 'ORG_SETTINGS'];
import { currentLoginRedirect } from '../../../lib/auth-redirect';
import { useFormat } from '../../../lib/format-context';
import { auditSubjectName } from '../../../lib/labels';

/** Rows are fetched this many at a time; "Load older entries" fetches the next lot. */
const PAGE_SIZE = 100;

const ACTION_OPTIONS: AuditAction[] = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'LOGIN',
  'LOGOUT',
  'IMPERSONATE',
  'EXPORT',
  'INVITE',
  'PERMISSION_CHANGE',
  'CONFIG_CHANGE',
  'BILLING_EVENT',
  'SYSTEM_EVENT',
];

export default function AuditPage() {
  return <AuditPageInner />;
}

function AuditPageInner() {
  const fmt = useFormat();
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('');
  const [filterEntityType, setFilterEntityType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  // Everyone seen in the rows loaded so far — the choices of the Person filter.
  const [people, setPeople] = useState<Array<{ id: string; label: string }>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Load only once the page gate passes (FE-014).
  const { ready, has, hasAny } = usePermissions();
  const allowed = ready && hasAny(AUDIT_KEYS);
  const canExport = has('EXPORTS');
  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    if (allowed) void refresh();
  }, [router, allowed]);

  function filters() {
    return {
      action: filterAction || undefined,
      entityType: filterEntityType.trim() || undefined,
      userId: filterUserId || undefined,
      from: filterFrom || undefined,
      to: filterTo || undefined,
    };
  }

  function remember(rows: AuditEntry[]) {
    setPeople((known) => {
      const next = [...known];
      for (const r of rows) {
        if (r.userId && !next.some((p) => p.id === r.userId)) next.push({ id: r.userId, label: r.userEmail ?? 'Someone without an email' });
      }
      return next;
    });
  }

  function fail(err: unknown, fallback: string) {
    if (err instanceof ApiError && err.status === 401) {
      clearTokens();
      router.replace(currentLoginRedirect());
      return;
    }
    setLoadError(err instanceof ApiError ? err.message : fallback);
  }

  async function refresh() {
    setLoadError(null);
    try {
      const data = await listAudit({ ...filters(), limit: PAGE_SIZE });
      setEntries(data);
      setHasMore(data.length === PAGE_SIZE);
      remember(data);
    } catch (err) {
      fail(err, 'Failed to load audit entries');
    }
  }

  async function loadOlder() {
    const last = entries?.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const older = await listAudit({ ...filters(), limit: PAGE_SIZE, cursor: last.id });
      setEntries((shown) => [...(shown ?? []), ...older]);
      setHasMore(older.length === PAGE_SIZE);
      remember(older);
    } catch (err) {
      fail(err, 'Older entries could not be loaded');
    } finally {
      setLoadingMore(false);
    }
  }

  async function exportCsv() {
    setLoadError(null);
    setExporting(true);
    try {
      await downloadAuditCsv(filters());
    } catch (err) {
      fail(err, 'The export could not be made');
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell>
      <RequireAnyPermission permissions={AUDIT_KEYS}>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1
            className="text-2xl font-semibold text-content-strong"
            data-testid="audit-heading"
          >
            Audit log
          </h1>
          <p className="mt-1 text-sm text-content-muted">
            Every mutation in the organization, captured for compliance.
            Sensitive fields (password hashes, MFA secrets, tokens) are
            redacted at write time — you'll see the field name in the
            redacted list but never the value.
          </p>
        </div>

        <section
          className="mb-6 rounded-lg border border-border bg-surface-1 p-4"
          data-testid="audit-filters"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 sm:items-end">
            <label className="block">
              <span className="text-sm font-medium text-content-default">Action</span>
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value as AuditAction | '')}
                data-testid="filter-action"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              >
                <option value="">(all actions)</option>
                {ACTION_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Entity type</span>
              <input
                value={filterEntityType}
                onChange={(e) => setFilterEntityType(e.target.value)}
                data-testid="filter-entity-type"
                placeholder="User, Position, Organization, …"
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">Person</span>
              <select value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)} data-testid="filter-person" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30">
                <option value="">(anyone)</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">From</span>
              <input type="date" value={filterFrom} max={filterTo || undefined} onChange={(e) => setFilterFrom(e.target.value)} data-testid="filter-from" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-content-default">To</span>
              <input type="date" value={filterTo} min={filterFrom || undefined} onChange={(e) => setFilterTo(e.target.value)} data-testid="filter-to" className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary/30" />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                data-testid="audit-apply-filters"
                className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90"
              >
                Apply
              </button>
              {canExport && (
                <button
                  type="button"
                  onClick={() => void exportCsv()}
                  disabled={exporting}
                  data-testid="audit-export"
                  className="h-10 rounded-md border border-border-strong bg-surface-bg px-4 text-sm font-medium text-content-strong hover:bg-surface-hover disabled:opacity-60"
                >
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              )}
            </div>
          </div>
        </section>

        {loadError && (
          <div
            role="alert"
            data-testid="audit-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <section>
          {entries === null && !loadError && (
            <p className="text-sm text-content-muted">Loading audit log…</p>
          )}
          {entries && entries.length === 0 && (
            <p
              data-testid="audit-empty"
              className="text-sm text-content-muted"
            >
              No audit entries match the current filters.
            </p>
          )}
          {entries && entries.length > 0 && (
            <ul className="space-y-2" data-testid="audit-list">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  data-testid={`audit-row-${entry.id}`}
                  className="rounded-lg border border-border bg-surface-1 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span
                      data-testid="audit-action-badge"
                      className="rounded bg-accent-primary/10 px-1.5 py-0.5 font-mono text-xs font-medium text-accent-primary"
                    >
                      {entry.action}
                    </span>
                    {entry.entityType && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-content-default">
                        {entry.entityType}
                        {entry.entityId && (
                          <span className="text-content-muted">:{entry.entityId.slice(0, 8)}</span>
                        )}
                      </span>
                    )}
                    {/* Which one: the name the record holds for it. The kind and the start of an id told nobody. */}
                    {auditSubjectName(entry.metadata) && (
                      <span data-testid="audit-subject" className="text-content-strong">
                        “{auditSubjectName(entry.metadata)}”
                      </span>
                    )}
                    <span className="text-content-muted">by</span>
                    <span className="font-medium text-content-strong">
                      {entry.userEmail ?? entry.userId ?? '(system)'}
                    </span>
                    <span className="ml-auto text-xs text-content-muted">
                      {fmt.dateTime(entry.createdAt)}
                    </span>
                  </div>
                  {entry.redactedKeys.length > 0 && (
                    <p className="mt-2 text-xs text-content-muted">
                      Redacted fields:{' '}
                      <span className="font-mono">
                        {entry.redactedKeys.join(', ')}
                      </span>
                    </p>
                  )}
                  {entry.metadata !== null && entry.metadata !== undefined && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-content-muted hover:text-content-default">
                        Metadata
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-surface-bg p-2 font-mono text-xs text-content-default">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                  {entry.changes !== null && entry.changes !== undefined && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-content-muted hover:text-content-default">
                        Changes
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-surface-bg p-2 font-mono text-xs text-content-default">
                        {JSON.stringify(entry.changes, null, 2)}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {entries && entries.length > 0 && hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => void loadOlder()}
                disabled={loadingMore}
                data-testid="audit-load-more"
                className="rounded-md border border-border-strong bg-surface-bg px-4 py-2 text-sm font-medium text-content-strong hover:bg-surface-hover disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Load older entries'}
              </button>
            </div>
          )}
        </section>
      </div>
      </RequireAnyPermission>
    </AppShell>
  );
}
