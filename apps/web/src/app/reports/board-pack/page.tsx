'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getBoardPack,
  type BoardPack,
} from '../../../lib/api-client';
import { PrintButton } from '../../../components/print-button';

const PERIOD_OPTIONS = [
  { label: '7 days', value: 7 },
  { label: '14 days', value: 14 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
] as const;

function formatChange(change: number | null, changePct: number | null): string {
  if (change === null) return '—';
  const sign = change >= 0 ? '+' : '';
  const pct = changePct !== null ? ` (${sign}${changePct.toFixed(1)}%)` : '';
  return `${sign}${change.toLocaleString()}${pct}`;
}

export default function BoardPackPage() {
  const router = useRouter();
  const [sinceDays, setSinceDays] = useState<number>(30);
  const [boardPack, setBoardPack] = useState<BoardPack | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load(sinceDays);
  }, [router]);

  async function load(days: number) {
    setLoading(true);
    setLoadError(null);
    setBoardPack(null);
    try {
      const data = await getBoardPack(days);
      setBoardPack(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load board pack');
    } finally {
      setLoading(false);
    }
  }

  function handlePeriodChange(days: number) {
    setSinceDays(days);
    void load(days);
  }

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1 no-print">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-content-strong hover:text-accent-primary"
            >
              KPI Nexus
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/reports" className="text-content-muted hover:text-content-strong">
                Reports
              </Link>
              <span className="text-content-muted">/</span>
              <span className="font-medium text-content-strong">Board Pack</span>
            </nav>
          </div>
          <PrintButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Period picker */}
        <div className="mb-8 flex flex-wrap items-center gap-3 no-print">
          <span className="text-sm font-medium text-content-muted">Period:</span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePeriodChange(opt.value)}
              data-testid={`board-pack-period-${opt.value}`}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                sinceDays === opt.value
                  ? 'bg-accent-primary text-white'
                  : 'border border-border bg-surface-1 text-content-default hover:bg-surface-2'
              } disabled:opacity-50`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loadError && (
          <div
            role="alert"
            data-testid="board-pack-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {loading && (
          <p className="text-sm text-content-muted" data-testid="board-pack-loading">
            Loading…
          </p>
        )}

        {boardPack && (
          <div data-testid="board-pack-content">
            {/* Header */}
            <header className="mb-8">
              <h1
                className="text-3xl font-bold text-content-strong"
                data-testid="board-pack-heading"
              >
                {boardPack.org.name} — Board Pack
              </h1>
              <p className="mt-1 text-sm text-content-muted">
                Period: {boardPack.period.from} to {boardPack.period.to} ({boardPack.period.sinceDays} days)
              </p>
            </header>

            {/* Top Movers */}
            <section className="mb-10" data-testid="board-pack-movers">
              <h2 className="mb-4 text-xl font-semibold text-content-strong">Top Movers</h2>
              {boardPack.topMovers.length === 0 ? (
                <p className="text-sm text-content-muted">No data available for this period.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {boardPack.topMovers.slice(0, 6).map((mover) => {
                    const isPositive = (mover.change ?? 0) >= 0;
                    return (
                      <div
                        key={mover.kpiId}
                        className="rounded-lg border border-border bg-surface-1 p-4"
                        data-testid={`mover-card-${mover.kpiId}`}
                      >
                        <p className="truncate text-sm font-medium text-content-strong">
                          {mover.name}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-content-strong">
                          {mover.currentValue?.toLocaleString() ?? '—'}
                          {mover.unit && (
                            <span className="ml-1 text-sm font-normal text-content-muted">
                              {mover.unit}
                            </span>
                          )}
                        </p>
                        <p
                          className={`mt-1 text-sm font-medium ${
                            isPositive ? 'text-status-success' : 'text-status-critical'
                          }`}
                        >
                          {formatChange(mover.change, mover.changePct)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* BSC Quadrants */}
            {boardPack.quadrants.length > 0 && (
              <section data-testid="board-pack-quadrants">
                <h2 className="mb-4 text-xl font-semibold text-content-strong">
                  Balanced Scorecard
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {boardPack.quadrants.map((quadrant, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-surface-1 p-4"
                      data-testid={`quadrant-card-${idx}`}
                    >
                      <h3 className="mb-3 font-semibold text-content-strong">{quadrant.name}</h3>

                      {/* Health distribution if present */}
                      {quadrant.healthDistribution && (
                        <div className="mb-3 flex gap-2 text-xs">
                          {Object.entries(quadrant.healthDistribution).map(([status, count]) => (
                            <span
                              key={status}
                              className={`rounded px-1.5 py-0.5 font-medium ${
                                status === 'CRITICAL' || status === 'RED'
                                  ? 'bg-status-critical/10 text-status-critical'
                                  : status === 'WARNING' || status === 'AMBER'
                                    ? 'bg-status-warning/10 text-status-warning'
                                    : 'bg-status-success/10 text-status-success'
                              }`}
                            >
                              {count} {status}
                            </span>
                          ))}
                        </div>
                      )}

                      {quadrant.kpis.length === 0 ? (
                        <p className="text-xs text-content-muted">No KPIs in this quadrant.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {quadrant.kpis.slice(0, 5).map((kpi) => (
                            <li
                              key={kpi.kpiId}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="truncate text-content-default">{kpi.name}</span>
                              <span className="ml-2 shrink-0 font-medium text-content-strong">
                                {kpi.value?.toLocaleString() ?? '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
