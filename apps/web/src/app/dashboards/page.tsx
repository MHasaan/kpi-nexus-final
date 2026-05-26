'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  deleteDashboard,
  getAccessToken,
  listDashboards,
  setDefaultDashboard,
  type Dashboard,
} from '../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../lib/terminology-context';

export default function DashboardsListPage() {
  return (
    <TerminologyProvider>
      <DashboardsListInner />
    </TerminologyProvider>
  );
}

function DashboardsListInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const [dashboards, setDashboards] = useState<Dashboard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
      const data = await listDashboards();
      setDashboards(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load dashboards',
      );
    }
  }

  async function handleSetDefault(dashboard: Dashboard) {
    setPendingId(dashboard.id);
    setActionError(null);
    try {
      await setDefaultDashboard(dashboard.id);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : `Failed to set default for ${dashboard.name}`,
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(dashboard: Dashboard) {
    if (!window.confirm(`Delete "${dashboard.name}"? It will be soft-deleted.`)) {
      return;
    }
    setPendingId(dashboard.id);
    setActionError(null);
    try {
      await deleteDashboard(dashboard.id);
      await refresh();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : `Failed to delete ${dashboard.name}`,
      );
    } finally {
      setPendingId(null);
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
                Home
              </Link>
              <Link
                href="/dashboards"
                className="font-medium text-accent-primary"
                data-testid="nav-dashboards"
              >
                {pluralize(terminology.dashboardLabel)}
              </Link>
              <Link href="/kpis" className="text-content-muted hover:text-content-strong">
                {pluralize(terminology.kpiLabel)}
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-semibold text-content-strong"
              data-testid="dashboards-heading"
            >
              {pluralize(terminology.dashboardLabel)}
            </h1>
            <p className="mt-1 text-sm text-content-muted">
              Build custom views of your {terminology.kpiLabel.toLowerCase()}{' '}
              data. Set one as your default to land here on sign-in.
            </p>
          </div>
          <Link
            href="/dashboards/new"
            data-testid="dashboards-new-link"
            className="h-10 inline-flex items-center rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90"
          >
            New {terminology.dashboardLabel.toLowerCase()}
          </Link>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="dashboards-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            data-testid="dashboards-action-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {actionError}
          </div>
        )}

        {dashboards !== null && dashboards.length === 0 && (
          <div
            data-testid="dashboards-empty"
            className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
          >
            <p className="text-sm text-content-muted">
              No {pluralize(terminology.dashboardLabel).toLowerCase()} yet.
              Create your first one to get started.
            </p>
          </div>
        )}

        {dashboards !== null && dashboards.length > 0 && (
          <section
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="dashboards-grid"
          >
            {dashboards.map((d) => (
              <article
                key={d.id}
                data-testid={`dashboard-card-${d.id}`}
                className="rounded-lg border border-border bg-surface-1 p-5"
              >
                <header className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboards/${d.id}`}
                    className="text-base font-semibold text-content-strong hover:text-accent-primary"
                  >
                    {d.name}
                  </Link>
                  <div className="flex flex-wrap gap-1">
                    {d.isDefault && (
                      <span className="rounded bg-accent-primary/10 px-1.5 py-0.5 text-xs font-medium text-accent-primary">
                        Default
                      </span>
                    )}
                    {d.isShared && (
                      <span className="rounded bg-status-success/10 px-1.5 py-0.5 text-xs font-medium text-status-success">
                        Shared
                      </span>
                    )}
                  </div>
                </header>
                {d.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-content-muted">
                    {d.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-content-muted">
                  {d.widgets.length} widget
                  {d.widgets.length === 1 ? '' : 's'} · updated{' '}
                  {new Date(d.updatedAt).toLocaleDateString()}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!d.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(d)}
                      disabled={pendingId === d.id}
                      data-testid={`dashboard-setdefault-${d.id}`}
                      className="rounded-md border border-border px-2.5 py-1 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    disabled={pendingId === d.id}
                    data-testid={`dashboard-delete-${d.id}`}
                    className="rounded-md border border-status-critical/40 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
