'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  captureSnapshot,
  clearTokens,
  deleteSnapshot,
  getAccessToken,
  getDashboard,
  listSnapshots,
  type Dashboard,
  type DashboardSnapshot,
} from '../../../../lib/api-client';
import { TerminologyProvider } from '../../../../lib/terminology-context';

export default function SnapshotsPage() {
  return (
    <TerminologyProvider>
      <SnapshotsInner />
    </TerminologyProvider>
  );
}

function SnapshotsInner() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const dashboardId = params.id;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [snapshots, setSnapshots] = useState<DashboardSnapshot[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Expanded snapshot payload view
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const [db, snaps] = await Promise.all([
        getDashboard(dashboardId),
        listSnapshots(dashboardId),
      ]);
      setDashboard(db);
      setSnapshots(snaps);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load snapshots');
    }
  }

  async function handleCapture() {
    setCapturing(true);
    setCaptureError(null);
    try {
      await captureSnapshot(dashboardId, { label: newLabel.trim() || undefined });
      setNewLabel('');
      await refresh();
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : 'Failed to capture snapshot');
    } finally {
      setCapturing(false);
    }
  }

  async function handleDelete(snap: DashboardSnapshot) {
    if (!window.confirm(`Delete snapshot "${snap.label ?? snap.id}"?`)) return;
    setDeletingId(snap.id);
    setDeleteError(null);
    try {
      await deleteSnapshot(snap.id);
      await refresh();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete snapshot');
    } finally {
      setDeletingId(null);
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
          <nav className="flex gap-4 text-sm text-content-muted">
            <Link href="/dashboards" className="hover:text-content-strong">
              Dashboards
            </Link>
            <span>›</span>
            <Link href={`/dashboards/${dashboardId}`} className="hover:text-content-strong">
              {dashboard?.name ?? dashboardId}
            </Link>
            <span>›</span>
            <span className="text-content-strong">Snapshots</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-semibold text-content-strong"
              data-testid="snapshots-heading"
            >
              Snapshots
            </h1>
            <p className="mt-1 text-sm text-content-muted">
              Frozen captures of this dashboard's widget values at a point in time.
            </p>
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="snapshots-load-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {/* Capture form */}
        <section
          className="mb-8 rounded-lg border border-border bg-surface-1 p-6"
          data-testid="snapshot-capture-section"
        >
          <h2 className="text-lg font-semibold text-content-strong">Capture snapshot</h2>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-sm font-medium text-content-default">
                Label <span className="text-content-muted">(optional)</span>
              </span>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                disabled={capturing}
                data-testid="snapshot-capture-label"
                placeholder="End of Q2 2026"
                className="mt-1 block rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong shadow-sm w-64"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleCapture()}
              disabled={capturing}
              data-testid="snapshot-capture-btn"
              className="h-10 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {capturing ? 'Capturing…' : 'Capture'}
            </button>
          </div>
          {captureError && (
            <p
              role="alert"
              data-testid="snapshot-capture-error"
              className="mt-3 text-sm text-status-critical"
            >
              {captureError}
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

        {snapshots === null && !loadError && (
          <p className="text-sm text-content-muted">Loading…</p>
        )}

        {snapshots?.length === 0 && (
          <div
            data-testid="snapshots-empty"
            className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
          >
            <p className="text-sm text-content-muted">
              No snapshots yet. Capture one above.
            </p>
          </div>
        )}

        {snapshots && snapshots.length > 0 && (
          <ul className="space-y-3" data-testid="snapshots-list">
            {snapshots.map((snap) => (
              <li
                key={snap.id}
                className="rounded-lg border border-border bg-surface-1"
                data-testid={`snapshot-row-${snap.id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <h3 className="text-base font-semibold text-content-strong">
                      {snap.label ?? 'Untitled snapshot'}
                    </h3>
                    <p className="mt-1 text-xs text-content-muted">
                      Captured {new Date(snap.takenAt).toLocaleString()}
                      {snap.takenByName && (
                        <span> by {snap.takenByName}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expandedId === snap.id ? null : snap.id)
                      }
                      data-testid={`snapshot-expand-${snap.id}`}
                      className="rounded-md border border-border px-2.5 py-1 text-xs text-content-default hover:bg-surface-2"
                    >
                      {expandedId === snap.id ? 'Collapse' : 'View payload'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(snap)}
                      disabled={deletingId === snap.id}
                      data-testid={`snapshot-delete-${snap.id}`}
                      className="rounded-md border border-status-critical/40 px-2.5 py-1 text-xs text-status-critical hover:bg-status-critical/10 disabled:opacity-50"
                    >
                      {deletingId === snap.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>

                {expandedId === snap.id && (
                  <div
                    className="border-t border-border bg-surface-bg p-4"
                    data-testid={`snapshot-payload-${snap.id}`}
                  >
                    <p className="mb-2 text-xs font-medium text-content-muted">
                      Frozen payload (read-only)
                    </p>
                    <SnapshotPayloadView payload={snap.payload} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

interface SnapshotPayloadViewProps {
  payload: Record<string, unknown>;
}

function SnapshotPayloadView({ payload }: SnapshotPayloadViewProps) {
  // Try to render widgets from payload if they exist in a structured way.
  // Fall back to pretty-printed JSON.
  const widgets = payload['widgets'];
  if (Array.isArray(widgets) && widgets.length > 0) {
    return (
      <div className="space-y-2">
        {widgets.map((w, i) => {
          const widget = w as Record<string, unknown>;
          return (
            <div
              key={String(widget['id'] ?? i)}
              className="rounded border border-border bg-surface-1 px-3 py-2 text-sm"
            >
              <p className="font-semibold text-content-strong">
                {String(widget['title'] ?? widget['widgetType'] ?? `Widget ${i + 1}`)}
              </p>
              {widget['latestValue'] !== undefined && (
                <p className="text-xs text-content-muted">
                  Latest value: {String(widget['latestValue'])}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <pre className="max-h-80 overflow-auto rounded border border-border bg-surface-1 p-3 text-xs text-content-muted">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
