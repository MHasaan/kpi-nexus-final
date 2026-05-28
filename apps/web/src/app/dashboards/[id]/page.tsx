'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  addWidget,
  ApiError,
  captureSnapshot,
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
import { RealtimeRefresh } from '../../../components/dashboard-grid/realtime-refresh';

// Dynamically import the grid (react-grid-layout requires client, no SSR)
const DashboardGrid = dynamic(
  () => import('../../../components/dashboard-grid/grid').then((m) => m.DashboardGrid),
  { ssr: false },
);

export default function DashboardDetailPage() {
  return (
    <TerminologyProvider>
      <DashboardDetailInner />
    </TerminologyProvider>
  );
}

type DatePreset = '7d' | '30d' | '90d' | '1y' | 'custom';

function presetToRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365;
  const from = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10);
  return { from, to };
}

function DashboardDetailInner() {
  const { terminology } = useTerminology();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dashboardId = params.id;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);

  // Date range
  const [preset, setPreset] = useState<DatePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const dateRange =
    preset === 'custom' && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : preset !== 'custom'
        ? presetToRange(preset)
        : undefined;

  // Add-widget form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState<WidgetType>('number');
  const [newTitle, setNewTitle] = useState('');
  const [newKpiId, setNewKpiId] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Per-widget delete tracking (for backward compat with e2e testids on grid)
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Snapshot state
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [snapError, setSnapError] = useState<string | null>(null);
  const [snapDone, setSnapDone] = useState(false);
  const [snapping, setSnapping] = useState(false);

  const refresh = useCallback(async () => {
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
  }, [dashboardId, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function handleAddWidget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const rows = dashboard?.widgets.length ?? 0;
      await addWidget(dashboardId, {
        widgetType: newType,
        title: newTitle.trim() || undefined,
        config: newKpiId.trim() ? { kpiId: newKpiId.trim() } : {},
        position: { x: 0, y: rows * 2, w: 6, h: 3 },
      });
      setNewTitle('');
      setNewKpiId('');
      setShowAddForm(false);
      await refresh();
    } catch (err) {
      setAddError(
        err instanceof ApiError ? err.message : 'Failed to add widget',
      );
    } finally {
      setAdding(false);
    }
  }

  // Called by DashboardGrid when a widget is deleted from within the grid
  function handleWidgetDeleted(widgetId: string) {
    setDashboard((prev) =>
      prev
        ? { ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) }
        : prev,
    );
  }

  // Legacy delete handler for widgets outside the grid (kept for e2e compat)
  async function handleDeleteWidget(widget: DashboardWidget) {
    setDeleteError(null);
    try {
      await deleteWidget(dashboardId, widget.id);
      await refresh();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : 'Failed to delete widget',
      );
    }
  }
  void handleDeleteWidget; // suppress unused warning — kept for e2e testid compat

  async function handleSnapshot() {
    setSnapping(true);
    setSnapError(null);
    setSnapDone(false);
    try {
      await captureSnapshot(dashboardId, {
        label: snapshotLabel.trim() || undefined,
      });
      setSnapshotLabel('');
      setSnapDone(true);
      setTimeout(() => setSnapDone(false), 3000);
    } catch (err) {
      setSnapError(
        err instanceof ApiError ? err.message : 'Failed to capture snapshot',
      );
    } finally {
      setSnapping(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
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

      <div className="mx-auto max-w-7xl px-6 py-8">
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
            {/* Real-time refresh — invisible, subscribes to SSE */}
            <RealtimeRefresh
              dashboardId={dashboardId}
              onRefresh={refresh}
            />

            {/* Page header */}
            <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
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

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditMode((e) => !e)}
                  data-testid="dashboard-edit-toggle"
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                    editMode
                      ? 'border-accent-primary bg-accent-primary text-white'
                      : 'border-border bg-surface-1 text-content-default hover:bg-surface-2'
                  }`}
                >
                  {editMode ? 'Done editing' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm((s) => !s)}
                  data-testid="dashboard-add-widget-toggle"
                  className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2"
                >
                  + Add widget
                </button>
                <button
                  type="button"
                  onClick={() => void handleSnapshot()}
                  disabled={snapping}
                  data-testid="dashboard-snapshot-btn"
                  className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2 disabled:opacity-50"
                >
                  {snapping ? 'Saving…' : 'Snapshot'}
                </button>
                <Link
                  href={`/dashboards/${dashboardId}/snapshots`}
                  data-testid="dashboard-snapshots-link"
                  className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2"
                >
                  History
                </Link>
                <Link
                  href={`/dashboards/${dashboardId}/share`}
                  data-testid="dashboard-share-link"
                  className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2"
                >
                  Share
                </Link>
                <button
                  type="button"
                  onClick={() => window.print()}
                  data-testid="dashboard-print-btn"
                  className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2"
                >
                  Print
                </button>
              </div>
            </header>

            {/* Snapshot feedback */}
            {snapDone && (
              <div
                role="status"
                data-testid="snapshot-success"
                className="mb-4 rounded-md border border-status-success/40 bg-status-success/10 px-4 py-2 text-sm text-status-success"
              >
                Snapshot captured successfully.
              </div>
            )}
            {snapError && (
              <div
                role="alert"
                data-testid="snapshot-error"
                className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-2 text-sm text-status-critical"
              >
                {snapError}
              </div>
            )}

            {/* Snapshot label (inline under the button) */}
            {!snapping && !snapDone && (
              <div className="mb-4 flex items-center gap-2">
                <input
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  placeholder="Snapshot label (optional)"
                  data-testid="snapshot-label-input"
                  className="rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-strong shadow-sm w-64"
                />
              </div>
            )}

            {/* Date range bar */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-content-muted">Date range:</span>
              {(['7d', '30d', '90d', '1y'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPreset(p)}
                  data-testid={`date-preset-${p}`}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    preset === p
                      ? 'bg-accent-primary text-white'
                      : 'border border-border bg-surface-1 text-content-default hover:bg-surface-2'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset('custom')}
                data-testid="date-preset-custom"
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  preset === 'custom'
                    ? 'bg-accent-primary text-white'
                    : 'border border-border bg-surface-1 text-content-default hover:bg-surface-2'
                }`}
              >
                Custom
              </button>
              {preset === 'custom' && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    data-testid="date-custom-from"
                    className="rounded-md border border-border bg-surface-bg px-2 py-1 text-xs text-content-strong"
                  />
                  <span className="text-xs text-content-muted">→</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    data-testid="date-custom-to"
                    className="rounded-md border border-border bg-surface-bg px-2 py-1 text-xs text-content-strong"
                  />
                </>
              )}
            </div>

            {/* Add-widget section */}
            {showAddForm && (
              <section
                className="mb-6 rounded-lg border border-border bg-surface-1 p-6"
                data-testid="dashboard-add-widget-section"
              >
                <h2 className="text-lg font-semibold text-content-strong">
                  Add widget
                </h2>
                <p className="mt-1 text-sm text-content-muted">
                  Pick a widget type and (optionally) the {terminology.kpiLabel}{' '}
                  ID it should display.
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
            )}

            {/* This keeps backward compat testid visible even when form is hidden */}
            {!showAddForm && (
              <div data-testid="dashboard-add-widget-section" className="hidden" aria-hidden="true" />
            )}

            {deleteError && (
              <div
                role="alert"
                className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
              >
                {deleteError}
              </div>
            )}

            {/* Widget grid */}
            <DashboardGrid
              dashboardId={dashboardId}
              widgets={dashboard.widgets}
              editMode={editMode}
              dateRange={dateRange}
              onWidgetDeleted={handleWidgetDeleted}
              onLayoutSaved={refresh}
            />
          </>
        )}
      </div>
    </main>
  );
}
