'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import {
  addWidget,
  ApiError,
  clearTokens,
  deleteWidget,
  getAccessToken,
  getDashboard,
  type Dashboard,
  type DashboardWidget,
  type WidgetType,
} from '../../../lib/api-client';
import {
  pluralize,
  TerminologyProvider,
  useTerminology,
} from '../../../lib/terminology-context';

export default function DashboardDetailPage() {
  return (
    <TerminologyProvider>
      <DashboardDetailInner />
    </TerminologyProvider>
  );
}

function DashboardDetailInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dashboardId = params.id;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Add-widget form state
  const [newType, setNewType] = useState<WidgetType>('number');
  const [newTitle, setNewTitle] = useState('');
  const [newKpiId, setNewKpiId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-widget delete tracking
  const [deletingWid, setDeletingWid] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, dashboardId]);

  async function refresh() {
    setLoadError(null);
    try {
      const data = await getDashboard(dashboardId);
      setDashboard(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setLoadError('Dashboard not found or you do not have access.');
        return;
      }
      setLoadError(
        err instanceof ApiError ? err.message : 'Failed to load dashboard',
      );
    }
  }

  async function handleAddWidget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      // Default position: next row of the 12-col grid. Until the grid
      // editor lands the user just gets stacked 6-wide widgets.
      const rows = dashboard?.widgets.length ?? 0;
      await addWidget(dashboardId, {
        widgetType: newType,
        title: newTitle.trim() || undefined,
        config: newKpiId.trim() ? { kpiId: newKpiId.trim() } : {},
        position: { x: 0, y: rows * 2, w: 6, h: 2 },
      });
      setNewTitle('');
      setNewKpiId('');
      await refresh();
    } catch (err) {
      setAddError(
        err instanceof ApiError ? err.message : 'Failed to add widget',
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteWidget(widget: DashboardWidget) {
    setDeletingWid(widget.id);
    setDeleteError(null);
    try {
      await deleteWidget(dashboardId, widget.id);
      await refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Failed to delete widget',
      );
    } finally {
      setDeletingWid(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-content-strong hover:text-accent-primary"
          >
            KPI Nexus
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboards" className="text-content-muted hover:text-content-strong">
              {pluralize(terminology.dashboardLabel)}
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {loadError && (
          <div
            role="alert"
            data-testid="dashboard-detail-load-error"
            className="rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {dashboard && (
          <>
            <header className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h1
                  className="text-2xl font-semibold text-content-strong"
                  data-testid="dashboard-detail-heading"
                >
                  {dashboard.name}
                </h1>
                {dashboard.description && (
                  <p className="mt-1 text-sm text-content-muted">
                    {dashboard.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-content-muted">
                  v{dashboard.version} · updated{' '}
                  {new Date(dashboard.updatedAt).toLocaleString()}
                  {dashboard.isDefault && ' · default'}
                  {dashboard.isShared && ' · shared'}
                </p>
              </div>
            </header>

            <section
              className="mb-8 rounded-lg border border-border bg-surface-1 p-6"
              data-testid="dashboard-add-widget-section"
            >
              <h2 className="text-lg font-semibold text-content-strong">
                Add widget
              </h2>
              <p className="mt-1 text-sm text-content-muted">
                Pick a widget type and (optionally) the {terminology.kpiLabel}{' '}
                ID it should display. Drag-and-drop layout editing lands later
                in P3.
              </p>
              <form
                onSubmit={handleAddWidget}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.5fr_1.5fr_auto] sm:items-end"
              >
                <label className="block">
                  <span className="text-sm font-medium text-content-default">
                    Type
                  </span>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as WidgetType)}
                    disabled={adding}
                    data-testid="widget-type-select"
                    className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
                  >
                    <option value="kpi_card">KPI card</option>
                    <option value="line">Line chart</option>
                    <option value="bar">Bar chart</option>
                    <option value="pie">Pie chart</option>
                    <option value="gauge">Gauge</option>
                    <option value="number">Number</option>
                    <option value="list">List</option>
                    <option value="trend">Trend</option>
                    <option value="activity">Activity</option>
                    <option value="strategy_map">Strategy map</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-content-default">
                    Title <span className="text-content-muted">(optional)</span>
                  </span>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={adding}
                    data-testid="widget-title-input"
                    maxLength={120}
                    className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-content-default">
                    {terminology.kpiLabel} ID{' '}
                    <span className="text-content-muted">(optional)</span>
                  </span>
                  <input
                    value={newKpiId}
                    onChange={(e) => setNewKpiId(e.target.value)}
                    disabled={adding}
                    data-testid="widget-kpiid-input"
                    placeholder="cmpm…"
                    className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={adding}
                  data-testid="widget-add-submit"
                  className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adding ? 'Adding…' : 'Add'}
                </button>
              </form>
              {addError && (
                <p
                  role="alert"
                  data-testid="widget-add-error"
                  className="mt-3 text-sm text-status-critical"
                >
                  {addError}
                </p>
              )}
            </section>

            {deleteError && (
              <div
                role="alert"
                className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
              >
                {deleteError}
              </div>
            )}

            {dashboard.widgets.length === 0 ? (
              <div
                data-testid="dashboard-widgets-empty"
                className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
              >
                <p className="text-sm text-content-muted">
                  No widgets yet. Add one above.
                </p>
              </div>
            ) : (
              <section
                data-testid="dashboard-widgets-grid"
                className="grid gap-4 sm:grid-cols-2"
              >
                {dashboard.widgets.map((w) => (
                  <article
                    key={w.id}
                    data-testid={`widget-card-${w.id}`}
                    className="rounded-lg border border-border bg-surface-1 p-5"
                  >
                    <header className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-content-strong">
                          {w.title ?? w.widgetType}
                        </h3>
                        <p className="mt-1 text-xs text-content-muted">
                          {w.widgetType} · {w.position.w}×{w.position.h}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteWidget(w)}
                        disabled={deletingWid === w.id}
                        data-testid={`widget-delete-${w.id}`}
                        className="rounded-md border border-status-critical/40 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </header>
                    {Boolean(w.config && Object.keys(w.config).length) && (
                      <pre className="mt-3 max-h-40 overflow-auto rounded-md border border-border bg-surface-bg p-2 text-xs text-content-muted">
                        {JSON.stringify(w.config, null, 2)}
                      </pre>
                    )}
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
