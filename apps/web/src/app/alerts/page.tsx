'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  acknowledgeAlert,
  ApiError,
  clearTokens,
  getAccessToken,
  listAlerts,
  resolveAlert,
  type Alert,
  type AlertSeverity,
  type AlertStatus,
} from '../../lib/api-client';

const SEVERITY_BADGE: Record<AlertSeverity, { emoji: string; cls: string }> = {
  HIGH: { emoji: '🔴', cls: 'bg-status-critical/10 text-status-critical border-status-critical/40' },
  MEDIUM: { emoji: '🟡', cls: 'bg-status-warning/10 text-status-warning border-status-warning/40' },
  LOW: { emoji: '🔵', cls: 'bg-accent-primary/10 text-accent-primary border-accent-primary/40' },
};

const STATUS_FILTERS: Array<{ label: string; value: AlertStatus | 'ALL' }> = [
  { label: 'Open', value: 'OPEN' },
  { label: 'Acknowledged', value: 'ACKNOWLEDGED' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'All', value: 'ALL' },
];

export default function AlertsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'ALL'>('OPEN');
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await listAlerts(
        statusFilter === 'ALL' ? {} : { status: statusFilter },
      );
      setAlerts(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load alerts');
    }
  }, [statusFilter, router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function handleAcknowledge(id: string) {
    setBusyId(id);
    try {
      await acknowledgeAlert(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to acknowledge');
    } finally {
      setBusyId(null);
    }
  }

  async function handleResolve(id: string) {
    setBusyId(id);
    try {
      await resolveAlert(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to resolve');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/alerts" className="font-medium text-content-strong">Alerts</Link>
            <Link href="/alerts/channels" className="text-content-muted hover:text-content-strong">Channels</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="alerts-heading">
            Alerts
          </h1>
          <Link
            href="/alerts/new"
            data-testid="alerts-new-link"
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-primary/90"
          >
            + New alert rule
          </Link>
        </div>

        {/* Status filter */}
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              data-testid={`alerts-filter-${f.value}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === f.value
                  ? 'bg-accent-primary text-white'
                  : 'border border-border bg-surface-1 text-content-default hover:bg-surface-2'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loadError && (
          <div role="alert" data-testid="alerts-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">
            {loadError}
          </div>
        )}

        {alerts && alerts.length === 0 && (
          <div data-testid="alerts-empty" className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center text-sm text-content-muted">
            No alerts for this filter.
          </div>
        )}

        {alerts && alerts.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="alerts-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                <tr>
                  <th className="px-4 py-2">Severity</th>
                  <th className="px-4 py-2">Message</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Raised</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const badge = SEVERITY_BADGE[a.severity];
                  return (
                    <tr key={a.id} data-testid={`alert-row-${a.id}`} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.emoji} {a.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-content-strong">
                        <Link href={`/alerts/${a.id}`} className="hover:text-accent-primary" data-testid={`alert-link-${a.id}`}>
                          {a.message}
                        </Link>
                      </td>
                      <td className="px-4 py-3" data-testid={`alert-status-${a.id}`}>{a.status}</td>
                      <td className="px-4 py-3 text-content-muted">{new Date(a.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        {a.status === 'OPEN' && (
                          <button
                            type="button"
                            onClick={() => void handleAcknowledge(a.id)}
                            disabled={busyId === a.id}
                            data-testid={`alert-ack-${a.id}`}
                            className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50"
                          >
                            {busyId === a.id ? '…' : 'Acknowledge'}
                          </button>
                        )}
                        {a.status !== 'RESOLVED' && (
                          <button
                            type="button"
                            onClick={() => void handleResolve(a.id)}
                            disabled={busyId === a.id}
                            data-testid={`alert-resolve-${a.id}`}
                            className="ml-2 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs text-content-default hover:bg-surface-2 disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
