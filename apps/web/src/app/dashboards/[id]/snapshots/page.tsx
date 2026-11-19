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
  getSnapshot,
  listSnapshots,
  type Dashboard,
  type DashboardSnapshot,
} from '../../../../lib/api-client';
import { AppShell } from '../../../../components/app-shell';
import { PermissionGuard } from '../../../../components/auth/permission-guard';
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
import { useConfirm } from '../../../../lib/use-confirm';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';
import { useFormat } from '../../../../lib/format-context';
import { WIDGET_TYPE_LABELS, labelFor } from '../../../../lib/labels';
import { useKpiNames } from '../../../../lib/use-kpi-names';

export default function SnapshotsPage() {
  return (
    <SnapshotsInner />
  );
}

function SnapshotsInner() {
  const fmt = useFormat();
  const router = useRouter();
  const confirm = useConfirm();
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

  // Expanded snapshot payload view. The LIST response carries no `payload`
  // (only id/label/takenBy/takenAt), so we lazily fetch the full snapshot via
  // getSnapshot(id) when a row is expanded and cache it here by id.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payloadById, setPayloadById] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [payloadLoadingId, setPayloadLoadingId] = useState<string | null>(null);
  const [payloadErrorById, setPayloadErrorById] = useState<
    Record<string, string>
  >({});

  async function handleToggleView(snap: DashboardSnapshot) {
    // Collapse if already expanded.
    if (expandedId === snap.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(snap.id);

    // Already loaded? Nothing to fetch.
    if (payloadById[snap.id]) return;

    setPayloadLoadingId(snap.id);
    setPayloadErrorById((prev) => {
      const next = { ...prev };
      delete next[snap.id];
      return next;
    });
    try {
      const full = await getSnapshot(snap.id);
      setPayloadById((prev) => ({
        ...prev,
        [snap.id]: full.payload ?? {},
      }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace(currentLoginRedirect());
        return;
      }
      setPayloadErrorById((prev) => ({
        ...prev,
        [snap.id]:
          err instanceof ApiError ? err.message : 'Failed to load snapshot',
      }));
    } finally {
      setPayloadLoadingId((cur) => (cur === snap.id ? null : cur));
    }
  }

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
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
        router.replace(currentLoginRedirect());
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
    const ok = await confirm({
      title: `Delete the snapshot “${snap.label ?? fmt.dateTime(snap.takenAt)}”?`,
      description: 'The saved copy is removed for everyone. The dashboard itself is not affected.',
      confirmLabel: 'Delete snapshot',
      tone: 'danger',
      testId: 'snapshot-delete-confirm',
    });
    if (!ok) return;
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

        {/* Capture form — taking a snapshot is DASHBOARD_MANAGE on the API (UI-013). */}
        <PermissionGuard permission="DASHBOARD_MANAGE">
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
        </PermissionGuard>

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
                      Captured {fmt.dateTime(snap.takenAt)}
                      {snap.takenByName && <span> by {snap.takenByName}</span>}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleToggleView(snap)}
                      disabled={payloadLoadingId === snap.id}
                      isLoading={payloadLoadingId === snap.id}
                      data-testid={`snapshot-view-${snap.id}`}
                    >
                      {expandedId === snap.id ? 'Collapse' : 'View'}
                    </Button>
                    <PermissionGuard permission="DASHBOARD_MANAGE">
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
                    </PermissionGuard>
                  </div>
                </div>

                {expandedId === snap.id && (
                  <div
                    className="border-t border-border-divider bg-surface-1 p-4"
                    data-testid={`snapshot-payload-${snap.id}`}
                  >
                    <p className="mb-2 text-xs font-medium text-content-muted">
                      What it held when it was taken
                    </p>
                    {payloadLoadingId === snap.id && (
                      <div className="space-y-2" data-testid={`snapshot-payload-loading-${snap.id}`}>
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    )}
                    {payloadErrorById[snap.id] && (
                      <p
                        role="alert"
                        data-testid={`snapshot-payload-error-${snap.id}`}
                        className="text-sm text-status-critical"
                      >
                        {payloadErrorById[snap.id]}
                      </p>
                    )}
                    {payloadById[snap.id] && (
                      <SnapshotPayloadView payload={payloadById[snap.id]!} />
                    )}
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

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Render a frozen snapshot payload defensively.
 *
 * The canonical shape (SnapshotPayload, from snapshots.service.ts) is:
 *   { dashboard: {...}, widgets: Widget[],
 *     kpiValues: Record<kpiId, { latestValue, latestRecordedAt }>,
 *     capturedAt }
 * — note `kpiValues` is an OBJECT MAP keyed by kpiId, not an array.
 *
 * Older seed snapshots may instead carry `{ dashboardName, capturedAt, kpis }`.
 * We render whatever is present and never crash; anything unrecognised falls
 * back to pretty-printed JSON.
 */
function SnapshotPayloadView({ payload }: SnapshotPayloadViewProps) {
  const fmt = useFormat();
  // Today's KPI names, for a snapshot taken before it kept them itself.
  const { kpis } = useKpiNames();
  const currentName = (kpiId: string): string | null => kpis.find((k) => k.id === kpiId)?.name ?? null;
  const widgets = Array.isArray(payload['widgets'])
    ? (payload['widgets'] as unknown[])
    : null;
  const kpiValuesMap = asRecord(payload['kpiValues']);
  const dashboardMeta = asRecord(payload['dashboard']);
  const capturedAt =
    typeof payload['capturedAt'] === 'string'
      ? (payload['capturedAt'] as string)
      : null;

  // Recognise the canonical captured shape.
  const hasCanonical = widgets !== null || kpiValuesMap !== null;

  if (hasCanonical) {
    return (
      <div className="space-y-3">
        {(dashboardMeta?.['name'] || capturedAt) && (
          <p className="text-xs tabular-nums text-content-muted">
            {dashboardMeta?.['name'] ? String(dashboardMeta['name']) : null}
            {dashboardMeta?.['name'] && capturedAt ? ' · ' : null}
            {capturedAt ? `Captured ${fmt.dateTime(capturedAt)}` : null}
          </p>
        )}

        {widgets && widgets.length > 0 && (
          <div className="space-y-2">
            {widgets.map((w, i) => {
              const widget = asRecord(w) ?? {};
              const cfg = asRecord(widget['config']);
              const kpiId =
                cfg && typeof cfg['kpiId'] === 'string'
                  ? (cfg['kpiId'] as string)
                  : null;
              // Look the captured value up from the kpiValues OBJECT MAP.
              const kv = kpiId ? asRecord(kpiValuesMap?.[kpiId]) : null;
              const latestValue = kv?.['latestValue'];
              const kind = typeof widget['widgetType'] === 'string' ? labelFor(WIDGET_TYPE_LABELS, widget['widgetType']) : `Widget ${i + 1}`;
              return (
                <div
                  key={String(widget['id'] ?? i)}
                  data-testid="snapshot-widget"
                  className="rounded border border-border bg-surface-bg px-3 py-2 text-sm"
                >
                  {/* What the value is of: the widget's own title, else the KPI's name as it was frozen
                      (or as it is now, for a snapshot taken before names were kept) — never the stored kind. */}
                  <p className="font-semibold text-content-strong">
                    {typeof widget['title'] === 'string' && widget['title']
                      ? widget['title']
                      : typeof kv?.['name'] === 'string' && kv['name']
                        ? kv['name']
                        : kpiId && currentName(kpiId)
                          ? currentName(kpiId)
                          : kind}
                  </p>
                  <p className="text-xs tabular-nums text-content-muted">
                    {kind}
                    {' · '}
                    {typeof latestValue === 'number'
                      ? `${fmt.number(latestValue)}${typeof kv?.['unit'] === 'string' && kv['unit'] ? ` ${kv['unit']}` : ''}`
                      : kpiId
                        ? 'No value at the time'
                        : 'Holds no single value'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* No widgets but we do have a kpiValues map — list raw entries. */}
        {(!widgets || widgets.length === 0) &&
          kpiValuesMap &&
          Object.keys(kpiValuesMap).length > 0 && (
            <div className="space-y-2">
              {Object.entries(kpiValuesMap).map(([kpiId, raw]) => {
                const kv = asRecord(raw);
                const latestValue = kv?.['latestValue'];
                return (
                  <div
                    key={kpiId}
                    className="rounded border border-border bg-surface-bg px-3 py-2 text-sm"
                  >
                    <p className="font-mono text-xs text-content-muted">{kpiId}</p>
                    <p className="text-xs tabular-nums text-content-strong">
                      {latestValue === undefined || latestValue === null
                        ? 'No data'
                        : String(latestValue)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    );
  }

  // Older seed shape: { dashboardName, capturedAt, kpis: [...] }.
  const seedKpis = Array.isArray(payload['kpis'])
    ? (payload['kpis'] as unknown[])
    : null;
  if (seedKpis && seedKpis.length > 0) {
    return (
      <div className="space-y-2">
        {(payload['dashboardName'] || capturedAt) && (
          <p className="text-xs tabular-nums text-content-muted">
            {payload['dashboardName'] ? String(payload['dashboardName']) : null}
            {payload['dashboardName'] && capturedAt ? ' · ' : null}
            {capturedAt ? `Captured ${fmt.dateTime(capturedAt)}` : null}
          </p>
        )}
        {seedKpis.map((k, i) => {
          const kpi = asRecord(k) ?? {};
          return (
            <div
              key={String(kpi['id'] ?? kpi['kpiId'] ?? i)}
              className="rounded border border-border bg-surface-bg px-3 py-2 text-sm"
            >
              <p className="font-semibold text-content-strong">
                {String(kpi['name'] ?? kpi['title'] ?? `KPI ${i + 1}`)}
              </p>
              {kpi['latestValue'] !== undefined && kpi['latestValue'] !== null && (
                <p className="text-xs tabular-nums text-content-muted">
                  Latest value: {String(kpi['latestValue'])}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Unknown shape — never crash; show the raw JSON.
  return (
    <pre className="max-h-80 overflow-auto rounded border border-border bg-surface-bg p-3 text-xs text-content-muted">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}
