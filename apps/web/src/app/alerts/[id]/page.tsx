'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  acknowledgeAlert,
  ApiError,
  clearTokens,
  getAccessToken,
  getAlert,
  resolveAlert,
  type Alert,
  type AlertSeverity,
} from '../../../lib/api-client';

const SEVERITY_BADGE: Record<AlertSeverity, { emoji: string; cls: string }> = {
  HIGH: { emoji: '🔴', cls: 'bg-status-critical/10 text-status-critical border-status-critical/40' },
  MEDIUM: { emoji: '🟡', cls: 'bg-status-warning/10 text-status-warning border-status-warning/40' },
  LOW: { emoji: '🔵', cls: 'bg-accent-primary/10 text-accent-primary border-accent-primary/40' },
};

export default function AlertDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const alertId = params.id;
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setAlert(await getAlert(alertId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      if (err instanceof ApiError && err.status === 404) {
        setLoadError('Alert not found.');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load alert');
    }
  }, [alertId, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function act(fn: (id: string) => Promise<Alert>) {
    setBusy(true);
    try {
      await fn(alertId);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/alerts" className="text-lg font-semibold text-content-strong hover:text-accent-primary">← Alerts</Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {loadError && (
          <div role="alert" data-testid="alert-detail-error" className="rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>
        )}

        {alert && (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[alert.severity].cls}`}>
                  {SEVERITY_BADGE[alert.severity].emoji} {alert.severity}
                </span>
                <h1 className="mt-2 text-2xl font-semibold text-content-strong" data-testid="alert-detail-message">{alert.message}</h1>
                <p className="mt-1 text-sm text-content-muted">
                  Status <span data-testid="alert-detail-status" className="font-medium text-content-strong">{alert.status}</span> · raised {new Date(alert.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {alert.status === 'OPEN' && (
                  <button type="button" onClick={() => void act(acknowledgeAlert)} disabled={busy} data-testid="alert-detail-ack" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm text-content-default hover:bg-surface-2 disabled:opacity-50">Acknowledge</button>
                )}
                {alert.status !== 'RESOLVED' && (
                  <button type="button" onClick={() => void act(resolveAlert)} disabled={busy} data-testid="alert-detail-resolve" className="rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-primary/90 disabled:opacity-50">Resolve</button>
                )}
              </div>
            </div>

            <dl className="mt-6 grid gap-3 rounded-lg border border-border bg-surface-1 p-6 text-sm sm:grid-cols-2">
              <div><dt className="text-content-muted">KPI</dt><dd className="font-medium text-content-strong">{alert.kpiId}</dd></div>
              <div><dt className="text-content-muted">Rule</dt><dd className="font-medium text-content-strong">{alert.alertRuleId ?? '—'}</dd></div>
              <div><dt className="text-content-muted">Acknowledged</dt><dd className="font-medium text-content-strong">{alert.acknowledgedAt ? new Date(alert.acknowledgedAt).toLocaleString() : '—'}</dd></div>
              <div><dt className="text-content-muted">Resolved</dt><dd className="font-medium text-content-strong">{alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString() : '—'}</dd></div>
              {alert.meta && typeof alert.meta.value === 'number' && (
                <div><dt className="text-content-muted">Breach value</dt><dd className="font-medium text-content-strong">{String(alert.meta.value)}</dd></div>
              )}
            </dl>

            <p className="mt-4 text-xs text-content-muted">
              AI explanation, related-KPI chart, and comments arrive in later phases (P5/P7).
            </p>
          </>
        )}
      </div>
    </main>
  );
}
