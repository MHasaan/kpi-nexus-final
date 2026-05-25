'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  listAudit,
  type AuditAction,
  type AuditEntry,
} from '../../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../../lib/terminology-context';

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
  return (
    <TerminologyProvider>
      <AuditPageInner />
    </TerminologyProvider>
  );
}

function AuditPageInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<AuditAction | ''>('');
  const [filterEntityType, setFilterEntityType] = useState('');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router]);

  async function refresh() {
    setLoadError(null);
    try {
      const data = await listAudit({
        action: filterAction || undefined,
        entityType: filterEntityType.trim() || undefined,
        limit: 100,
      });
      setEntries(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load audit entries',
      );
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/dashboard" className="text-content-muted hover:text-content-strong">
                Dashboard
              </Link>
              <Link href="/users" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.memberLabel)}
              </Link>
              <Link href="/roles" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.roleLabel)}
              </Link>
              <Link href="/positions" className="text-content-muted hover:text-content-strong">
                Positions
              </Link>
              <Link
                href="/settings/organization"
                className="text-content-muted hover:text-content-strong"
              >
                Settings
              </Link>
              <Link
                href="/settings/audit"
                className="font-medium text-accent-primary"
                data-testid="nav-audit"
              >
                Audit log
              </Link>
            </nav>
          </div>
        </div>
      </header>

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
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
            <button
              type="button"
              onClick={() => void refresh()}
              data-testid="audit-apply-filters"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90"
            >
              Apply
            </button>
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
                    <span className="text-content-muted">by</span>
                    <span className="font-medium text-content-strong">
                      {entry.userEmail ?? entry.userId ?? '(system)'}
                    </span>
                    <span className="ml-auto text-xs text-content-muted">
                      {new Date(entry.createdAt).toLocaleString()}
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
        </section>
      </div>
    </main>
  );
}
