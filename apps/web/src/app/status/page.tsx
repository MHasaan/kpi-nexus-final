'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken, getHealthDetails, type HealthDetails } from '../../lib/api-client';

const REFRESH_INTERVAL_MS = 10_000;

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function StatusDot({ status }: { status: 'ok' | 'down' }) {
  return (
    <span
      aria-label={status === 'ok' ? 'Operational' : 'Down'}
      className={`inline-block h-3 w-3 rounded-full ${status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}
      data-testid={`status-dot-${status}`}
    />
  );
}

export default function StatusPage() {
  const router = useRouter();
  const [data, setData] = useState<HealthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await getHealthDetails();
      setData(result);
      setLastRefreshed(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to fetch health details');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load, router]);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">System Status</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="status-heading">
            System Status
          </h1>
          {lastRefreshed && (
            <p className="text-xs text-content-muted">
              Last refreshed: {lastRefreshed.toLocaleTimeString()} &middot; auto-refreshes every 10s
            </p>
          )}
        </div>

        {loading && !data && (
          <p className="mt-6 text-sm text-content-muted" data-testid="status-loading">
            Checking components&hellip;
          </p>
        )}

        {error && (
          <p className="mt-6 text-sm text-status-critical" data-testid="status-error">
            {error}
          </p>
        )}

        {data && (
          <>
            {/* Overall status banner */}
            <div
              data-testid="status-overall"
              className={`mt-6 flex items-center gap-3 rounded-lg border px-5 py-4 ${
                data.status === 'ok'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <StatusDot status={data.status === 'ok' ? 'ok' : 'down'} />
              <span className="font-medium capitalize" data-testid="status-overall-text">
                {data.status === 'ok' ? 'All systems operational' : 'Degraded — one or more components are down'}
              </span>
            </div>

            {/* Components table */}
            <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface-1">
              <table className="w-full text-sm" data-testid="status-components-table">
                <thead>
                  <tr className="border-b border-border bg-surface-bg text-content-muted">
                    <th className="px-5 py-3 text-left font-medium">Component</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-right font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.components.map((c) => (
                    <tr
                      key={c.name}
                      data-testid={`status-component-${c.name}`}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-3 font-medium text-content-strong capitalize">
                        {c.name}
                      </td>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2">
                          <StatusDot status={c.status} />
                          <span
                            className={c.status === 'ok' ? 'text-green-700' : 'text-red-700'}
                            data-testid={`status-component-${c.name}-status`}
                          >
                            {c.status === 'ok' ? 'Operational' : 'Down'}
                          </span>
                        </span>
                      </td>
                      <td
                        className="px-5 py-3 text-right text-content-muted"
                        data-testid={`status-component-${c.name}-latency`}
                      >
                        {c.latencyMs} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Process info footer */}
            <div className="mt-4 flex gap-6 text-xs text-content-muted">
              <span data-testid="status-uptime">
                Uptime: <strong className="text-content-strong">{formatUptime(data.uptimeSeconds)}</strong>
              </span>
              <span data-testid="status-timestamp">
                Server time: <strong className="text-content-strong">{new Date(data.timestamp).toLocaleString()}</strong>
              </span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
