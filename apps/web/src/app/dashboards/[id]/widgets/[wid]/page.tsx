'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  ApiError,
  clearTokens,
  getAccessToken,
  getDashboard,
  listKpiDataPoints,
  listKpis,
  type Dashboard,
  type DataPoint,
  type KpiSummary,
} from '../../../../../lib/api-client';
import { TerminologyProvider } from '../../../../../lib/terminology-context';

// Recharts must be client-only
const DrillDownChart = dynamic(() => import('./drill-down-chart').then((m) => m.DrillDownChart), {
  ssr: false,
});

export default function WidgetDrillDownPage() {
  return (
    <TerminologyProvider>
      <DrillDownInner />
    </TerminologyProvider>
  );
}

type ChartMode = 'line' | 'bar' | 'area';

function DrillDownInner() {
  const router = useRouter();
  const params = useParams<{ id: string; wid: string }>();
  const dashboardId = params.id;
  const widgetId = params.wid;

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [chartMode, setChartMode] = useState<ChartMode>('line');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [qualityFilter, setQualityFilter] = useState<string>('');

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [router, dashboardId, widgetId, fromDate, toDate]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const db = await getDashboard(dashboardId);
      setDashboard(db);
      const widget = db.widgets.find((w) => w.id === widgetId);
      if (!widget) {
        setLoadError('Widget not found on this dashboard.');
        return;
      }
      const kpiId = widget.config['kpiId'] as string | undefined;
      if (kpiId) {
        const [allKpis, points] = await Promise.all([
          listKpis(),
          listKpiDataPoints(kpiId, {
            from: fromDate || undefined,
            to: toDate || undefined,
          }),
        ]);
        setKpi(allKpis.find((k) => k.id === kpiId) ?? null);
        setDataPoints(points);
      } else {
        setDataPoints([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        router.replace('/login');
        return;
      }
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load widget data');
    } finally {
      setLoading(false);
    }
  }

  const widget = dashboard?.widgets.find((w) => w.id === widgetId);

  // Filter by quality client-side
  const filteredPoints = qualityFilter
    ? dataPoints.filter((dp) => dp.qualityFlag === qualityFilter)
    : dataPoints;

  // Stats
  const values = filteredPoints.map((dp) => dp.value);
  const min = values.length ? Math.min(...values) : null;
  const max = values.length ? Math.max(...values) : null;
  const avg = values.length
    ? values.reduce((a, b) => a + b, 0) / values.length
    : null;

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
            <span className="text-content-strong">
              {widget?.title ?? widget?.widgetType ?? 'Widget'}
            </span>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {loadError && (
          <div
            role="alert"
            data-testid="drilldown-error"
            className="mb-6 rounded-md border border-status-critical/40 bg-status-critical/10 px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        <h1
          className="mb-6 text-2xl font-semibold text-content-strong"
          data-testid="drilldown-heading"
        >
          {widget?.title ?? kpi?.name ?? 'Widget drill-down'}
        </h1>

        {/* Filters */}
        <section className="mb-6 flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface-1 p-4">
          <label className="block">
            <span className="text-xs font-medium text-content-muted">From</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              data-testid="drilldown-from"
              className="mt-1 block rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-strong"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-content-muted">To</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              data-testid="drilldown-to"
              className="mt-1 block rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-strong"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-content-muted">Quality</span>
            <select
              value={qualityFilter}
              onChange={(e) => setQualityFilter(e.target.value)}
              data-testid="drilldown-quality"
              className="mt-1 block rounded-md border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-strong"
            >
              <option value="">All</option>
              <option value="GOOD">Good</option>
              <option value="ESTIMATE">Estimate</option>
              <option value="POOR">Poor</option>
            </select>
          </label>
          <div className="flex gap-2">
            {(['line', 'bar', 'area'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                data-testid={`chart-mode-${m}`}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                  chartMode === m
                    ? 'bg-accent-primary text-white'
                    : 'border border-border text-content-default hover:bg-surface-2'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </section>

        {/* Stats tiles */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[
            { label: 'Min', value: min },
            { label: 'Avg', value: avg !== null ? Math.round(avg * 100) / 100 : null },
            { label: 'Max', value: max },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-lg border border-border bg-surface-1 p-4 text-center"
              data-testid={`drilldown-stat-${label.toLowerCase()}`}
            >
              <p className="text-xs uppercase tracking-wide text-content-muted">{label}</p>
              <p className="mt-1 text-2xl font-bold text-content-strong">
                {value !== null ? value.toLocaleString() : '—'}
                {value !== null && kpi?.unit ? (
                  <span className="ml-1 text-sm font-normal text-content-muted">{kpi.unit}</span>
                ) : null}
              </p>
            </div>
          ))}
        </div>

        {/* Chart */}
        {loading ? (
          <p className="text-sm text-content-muted">Loading…</p>
        ) : filteredPoints.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center"
            data-testid="drilldown-no-data"
          >
            <p className="text-sm text-content-muted">No data for the selected range.</p>
          </div>
        ) : (
          <div
            className="rounded-lg border border-border bg-surface-1 p-4"
            style={{ height: 320 }}
            data-testid="drilldown-chart"
          >
            <DrillDownChart dataPoints={filteredPoints} mode={chartMode} />
          </div>
        )}

        {/* Data table */}
        {filteredPoints.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-semibold text-content-strong">Raw data</h2>
            <div className="overflow-auto rounded-lg border border-border bg-surface-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2 text-left text-xs text-content-muted">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Value</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPoints.slice(0, 100).map((dp) => (
                    <tr
                      key={dp.id}
                      className="border-b border-border last:border-0 hover:bg-surface-bg"
                    >
                      <td className="px-3 py-2 tabular-nums text-content-muted">
                        {new Date(dp.recordedAt).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 font-semibold tabular-nums text-content-strong">
                        {dp.value}
                        {kpi?.unit ? ` ${kpi.unit}` : ''}
                      </td>
                      <td className="px-3 py-2 text-xs text-content-muted">
                        {dp.periodStart.slice(0, 10)} → {dp.periodEnd.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2 text-xs text-content-muted">
                        {dp.qualityFlag}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
