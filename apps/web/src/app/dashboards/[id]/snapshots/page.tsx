'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';

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
import { AppShell } from '../../../../components/app-shell';
import { RequirePermission } from '../../../../components/auth/require-permission';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
} from '../../../../components/ui';

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
    <RequirePermission permission="DASHBOARD_VIEW">
    <AppShell>
      <PageHeader
        title={<span data-testid="snapshots-heading">Snapshots</span>}
        subtitle={
          dashboard
            ? `Frozen captures of "${dashboard.name}" widget values at a point in time.`
            : "Frozen captures of this dashboard's widget values at a point in time."
        }
        actions={
          <Link href={`/dashboards/${dashboardId}`}>
            <Button variant="ghost" size="sm">
              Back to dashboard
            </Button>
          </Link>
        }
      />

      <div className="mt-6 max-w-4xl space-y-6">
        {loadError && (
          <div
            role="alert"
            data-testid="snapshots-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {/* Capture form */}
        <Card data-testid="snapshot-capture-section">
          <CardContent>
            <h2 className="text-base font-semibold text-content-strong">Capture snapshot</h2>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="snapshot-label">
                  Label{' '}
                  <span className="font-normal text-content-muted">(optional)</span>
                </Label>
                <Input
                  id="snapshot-label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  disabled={capturing}
                  data-testid="snapshot-capture-label"
                  placeholder="End of Q2 2026"
                  className="w-64"
                />
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleCapture()}
                disabled={capturing}
                isLoading={capturing}
                data-testid="snapshot-capture-btn"
                leftIcon={!capturing ? <Camera className="h-4 w-4" /> : undefined}
              >
                {capturing ? 'Capturing…' : 'Capture'}
              </Button>
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
          </CardContent>
        </Card>

        {deleteError && (
          <div
            role="alert"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {deleteError}
          </div>
        )}

        {snapshots === null && !loadError && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}

        {snapshots?.length === 0 && (
          <Card data-testid="snapshots-empty">
            <EmptyState
              icon={Camera}
              title="No snapshots yet"
              description="Capture one above to preserve how this dashboard looks right now."
            />
          </Card>
        )}

        {snapshots && snapshots.length > 0 && (
          <ul className="space-y-3" data-testid="snapshots-list">
            {snapshots.map((snap) => (
              <Card key={snap.id} as="li" data-testid={`snapshot-row-${snap.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <h3 className="text-base font-semibold text-content-strong">
                      {snap.label ?? 'Untitled snapshot'}
                    </h3>
                    <p className="mt-1 text-xs tabular-nums text-content-muted">
                      Captured {new Date(snap.takenAt).toLocaleString()}
                      {snap.takenByName && <span> by {snap.takenByName}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setExpandedId(expandedId === snap.id ? null : snap.id)
                      }
                      data-testid={`snapshot-view-${snap.id}`}
                    >
                      {expandedId === snap.id ? 'Collapse' : 'View'}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => void handleDelete(snap)}
                      disabled={deletingId === snap.id}
                      isLoading={deletingId === snap.id}
                      data-testid={`snapshot-delete-${snap.id}`}
                    >
                      {deletingId === snap.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                </div>

                {expandedId === snap.id && (
                  <div
                    className="border-t border-border-divider bg-surface-1 p-4"
                    data-testid={`snapshot-payload-${snap.id}`}
                  >
                    <p className="mb-2 text-xs font-medium text-content-muted">
                      Frozen payload (read-only)
                    </p>
                    <SnapshotPayloadView payload={snap.payload} />
                  </div>
                )}
              </Card>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
    </RequirePermission>
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
              className="rounded border border-border bg-surface-bg px-3 py-2 text-sm"
            >
              <p className="font-semibold text-content-strong">
                {String(widget['title'] ?? widget['widgetType'] ?? `Widget ${i + 1}`)}
              </p>
              {widget['latestValue'] !== undefined && (
                <p className="text-xs tabular-nums text-content-muted">
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
    <pre className="max-h-80 overflow-auto rounded border border-border bg-surface-bg p-3 text-xs text-content-muted">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
