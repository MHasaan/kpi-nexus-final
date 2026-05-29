'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  listNotificationDeliveries,
  retryNotificationDelivery,
  type NotificationDelivery,
} from '../../../../lib/api-client';

export default function DlqPage() {
  const router = useRouter();
  const [rows, setRows] = useState<NotificationDelivery[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await listNotificationDeliveries('FAILED'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load deliveries');
    }
  }, [router]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh();
  }, [router, refresh]);

  async function handleRetry(id: string) {
    setBusyId(id);
    try {
      await retryNotificationDelivery(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Retry failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/settings/notifications" className="text-content-muted hover:text-content-strong">Notifications</Link>
            <Link href="/settings/notifications/dlq" className="font-medium text-content-strong">Delivery log</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="dlq-heading">Failed deliveries (DLQ)</h1>
          <button type="button" onClick={() => void refresh()} data-testid="dlq-refresh" className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm hover:bg-surface-2">Refresh</button>
        </div>

        {loadError && <div role="alert" data-testid="dlq-error" className="mb-4 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical">{loadError}</div>}

        {rows && rows.length === 0 && (
          <div data-testid="dlq-empty" className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center text-sm text-content-muted">
            No failed deliveries. 🎉
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1" data-testid="dlq-table">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-left text-xs uppercase text-content-muted">
                <tr><th className="px-4 py-2">Delivery</th><th className="px-4 py-2">Attempts</th><th className="px-4 py-2">Error</th><th className="px-4 py-2">Failed at</th><th className="px-4 py-2 text-right">Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} data-testid={`dlq-row-${d.id}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-content-muted">{d.id.slice(0, 10)}…</td>
                    <td className="px-4 py-3">{d.attempts}</td>
                    <td className="px-4 py-3 text-content-muted">{d.error ?? '—'}</td>
                    <td className="px-4 py-3 text-content-muted">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => void handleRetry(d.id)} disabled={busyId === d.id} data-testid={`dlq-retry-${d.id}`} className="rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs hover:bg-surface-2 disabled:opacity-50">{busyId === d.id ? '…' : 'Retry'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
