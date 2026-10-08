'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getBoardPack,
  type BoardPack,
} from '../../../lib/api-client';
import { AppShell } from '../../../components/app-shell';
import { PrintButton } from '../../../components/print-button';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '../../../components/ui';

const CRUMBS = [{ label: 'Execute' }, { label: 'Reports', href: '/reports' }, { label: 'Board pack' }];

const PERIOD_OPTIONS = [
  { label: '7 days', value: '7' },
  { label: '14 days', value: '14' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
] as const;

/** Tone + readable label for a board-pack status (see BoardPackStatus). */
function quadrantTone(status: string): { cls: string; label: string } {
  if (status === 'OFF_TRACK' || status === 'CRITICAL' || status === 'RED') {
    return { cls: 'bg-status-critical-bg text-status-critical', label: 'off track' };
  }
  if (status === 'AT_RISK' || status === 'WARNING' || status === 'AMBER') {
    return { cls: 'bg-status-warning-bg text-status-warning', label: 'at risk' };
  }
  if (status === 'ON_TRACK') {
    return { cls: 'bg-status-success-bg text-status-success', label: 'on track' };
  }
  // NO_TARGET / NO_DATA / anything unknown: neutral, never "healthy" green.
  return {
    cls: 'bg-surface-hover text-content-muted',
    label: status === 'NO_DATA' ? 'no data' : status === 'NO_TARGET' ? 'no target' : status.toLowerCase(),
  };
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

  function handlePeriodChange(value: string) {
    const days = Number(value);
    setSinceDays(days);
    void load(days);
  }

  return (
    <AppShell title="Board pack" crumbs={CRUMBS}>
      {/* Controls (hidden in print) */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-2">
          {/* Keep per-period testids on equivalent radio elements */}
          <span className="text-sm font-medium text-content-muted">Period</span>
          <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg bg-surface-1 p-1 shadow-inset">
            {PERIOD_OPTIONS.map((opt) => {
              const active = String(sinceDays) === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handlePeriodChange(opt.value)}
                  data-testid={`board-pack-period-${opt.value}`}
                  disabled={loading}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium tabular-nums transition-colors duration-fast disabled:opacity-50 ${
                    active
                      ? 'bg-surface-bg text-content-strong shadow-xs'
                      : 'text-content-muted hover:text-content-strong'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <PrintButton />
      </div>

      {loadError && (
        <div
          role="alert"
          data-testid="board-pack-error"
          className="mb-6 rounded-lg border border-status-critical/40 bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {loadError}
        </div>
      )}

      {loading && (
        <div data-testid="board-pack-loading" className="space-y-4">
          <span className="sr-only">Loading board pack…</span>
          <Skeleton className="h-10 w-80" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" aria-hidden />
            ))}
          </div>
        </div>
      )}

      {boardPack && (
        <div data-testid="board-pack-content" className="space-y-10">
          {/* Presentation-grade header */}
          <header>
            <p className="kn-eyebrow text-content-muted">Executive board pack</p>
            <h1
              className="mt-1 text-3xl font-bold tracking-tight text-content-strong"
              data-testid="board-pack-heading"
            >
              {boardPack.org.name}
            </h1>
            <p className="mt-1 text-sm tabular-nums text-content-muted">
              {boardPack.period.from} – {boardPack.period.to} ({boardPack.period.sinceDays} days)
            </p>
          </header>

          {/* Top movers */}
          <section data-testid="board-pack-movers">
            <h2 className="mb-4 text-xl font-semibold tracking-tight text-content-strong">
              Top movers
            </h2>
            {boardPack.topMovers.length === 0 ? (
              <p className="text-sm text-content-muted">No data available for this period.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {boardPack.topMovers.slice(0, 6).map((mover) => {
                  const change = mover.change ?? 0;
                  const flat = mover.change === null || change === 0;
                  const positive = change > 0;
                  const sign = positive ? '+' : '';
                  const pct =
                    mover.changePct !== null ? ` (${sign}${mover.changePct.toFixed(1)}%)` : '';
                  const ChangeIcon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
                  const changeCls = flat
                    ? 'text-content-muted'
                    : positive
                      ? 'text-status-success'
                      : 'text-status-critical';
                  return (
                    <Card key={mover.kpiId} data-testid={`mover-card-${mover.kpiId}`} className="p-4">
                      <p className="truncate text-sm font-medium text-content-strong">
                        {mover.name}
                      </p>
                      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-content-strong">
                        {mover.currentValue?.toLocaleString() ?? '—'}
                        {mover.unit && (
                          <span className="ml-1 text-sm font-normal text-content-muted">
                            {mover.unit}
                          </span>
                        )}
                      </p>
                      <p
                        className={`mt-1 inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${changeCls}`}
                      >
                        <ChangeIcon className="h-4 w-4" aria-hidden />
                        {mover.change === null
                          ? '—'
                          : `${sign}${change.toLocaleString()}${pct}`}
                      </p>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Balanced scorecard quadrants */}
          {boardPack.quadrants.length > 0 && (
            <section data-testid="board-pack-quadrants">
              <h2 className="mb-4 text-xl font-semibold tracking-tight text-content-strong">
                Balanced scorecard
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {boardPack.quadrants.map((quadrant, idx) => (
                  <Card key={idx} data-testid={`quadrant-card-${idx}`}>
                    <CardHeader>
                      <CardTitle>{quadrant.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {quadrant.healthDistribution && (
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          {Object.entries(quadrant.healthDistribution).map(([status, count]) => {
                            const tone = quadrantTone(status);
                            return (
                              <span
                                key={status}
                                className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${tone.cls}`}
                              >
                                {count} {tone.label}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {quadrant.kpis.length === 0 ? (
                        <p className="text-xs text-content-muted">No KPIs in this quadrant.</p>
                      ) : (
                        <ul className="divide-y divide-border-divider">
                          {quadrant.kpis.slice(0, 5).map((kpi) => (
                            <li
                              key={kpi.kpiId}
                              className="flex items-center justify-between gap-2 py-1.5 text-sm"
                            >
                              <span className="truncate text-content">{kpi.name}</span>
                              <span className="shrink-0 font-medium tabular-nums text-content-strong">
                                {kpi.value?.toLocaleString() ?? '—'}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
