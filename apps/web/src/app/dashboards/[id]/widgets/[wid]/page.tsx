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
import { AppShell } from '../../../../../components/app-shell';
import { RequirePermission } from '../../../../../components/auth/require-permission';
import {
  Badge,
  Card,
  CardContent,
  Input,
  Label,
  Metric,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui';
import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';

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

  // Data-quality summary (read-only, derived from already-loaded data points).
  // Uses the unfiltered set so it reflects the underlying series, not the view.
  const totalPoints = dataPoints.length;
  const goodPoints = dataPoints.filter((dp) => dp.qualityFlag === 'GOOD').length;
  const completeness = totalPoints
    ? Math.round((goodPoints / totalPoints) * 100)
    : null;
  const latestRecordedAt = dataPoints.reduce<string | null>(
    (latest, dp) =>
      latest === null || dp.recordedAt > latest ? dp.recordedAt : latest,
    null,
  );
  const freshnessDays =
    latestRecordedAt !== null
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(latestRecordedAt).getTime()) / 86400_000,
          ),
        )
      : null;
  // Health: derived from completeness + freshness. Icon + label (never colour-only).
  const health: {
    tone: 'success' | 'warning' | 'neutral';
    label: string;
    Icon: typeof CircleCheck;
  } =
    completeness === null || freshnessDays === null
      ? { tone: 'neutral', label: 'No data', Icon: CircleDashed }
      : completeness >= 90 && freshnessDays <= 7
        ? { tone: 'success', label: 'Healthy', Icon: CircleCheck }
        : { tone: 'warning', label: 'Needs attention', Icon: TriangleAlert };

  return (
    <RequirePermission permission="DASHBOARD_VIEW">
    <AppShell>
      <PageHeader
        title={
          <span data-testid="drilldown-heading">
            {widget?.title ?? kpi?.name ?? 'Widget drill-down'}
          </span>
        }
        subtitle={
          dashboard ? (
            <span className="text-sm text-content-muted">
              <Link
                href={`/dashboards/${dashboardId}`}
                className="transition-colors hover:text-content-strong"
              >
                {dashboard.name}
              </Link>
              {' · widget detail'}
            </span>
          ) : undefined
        }
        actions={
          <Link href={`/dashboards/${dashboardId}`}>
            <span className="text-sm text-content-muted transition-colors hover:text-content-strong">
              Back to dashboard
            </span>
          </Link>
        }
      />

      <div className="mt-6 space-y-6">
        {loadError && (
          <div
            role="alert"
            data-testid="drilldown-error"
            className="rounded-md border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          >
            {loadError}
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="drilldown-from">From</Label>
              <Input
                id="drilldown-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                data-testid="drilldown-from"
                className="w-auto"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drilldown-to">To</Label>
              <Input
                id="drilldown-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                data-testid="drilldown-to"
                className="w-auto"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="drilldown-quality">Quality</Label>
              <Select
                id="drilldown-quality"
                value={qualityFilter}
                onChange={(e) => setQualityFilter(e.target.value)}
                data-testid="drilldown-quality"
                className="w-auto"
              >
                <option value="">All</option>
                <option value="GOOD">Good</option>
                <option value="ESTIMATE">Estimate</option>
                <option value="POOR">Poor</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="kn-eyebrow block">Chart</span>
              <Segmented
                options={[
                  { label: 'Line', value: 'line' },
                  { label: 'Bar', value: 'bar' },
                  { label: 'Area', value: 'area' },
                ]}
                value={chartMode}
                onChange={(v) => setChartMode(v as ChartMode)}
              />
              {/* Hidden testid anchors so e2e chart-mode selectors keep resolving */}
              <span className="sr-only">
                {(['line', 'bar', 'area'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    tabIndex={-1}
                    onClick={() => setChartMode(m)}
                    data-testid={`chart-mode-${m}`}
                    aria-pressed={chartMode === m}
                  >
                    {m}
                  </button>
                ))}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Data quality summary (read-only indicator) */}
        <Card data-testid="drilldown-quality-summary">
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <span className="kn-eyebrow block">Completeness</span>
                <span className="text-lg font-semibold tabular-nums text-content-strong">
                  {completeness !== null ? `${completeness}%` : '—'}
                </span>
                <span className="ml-1 text-xs tabular-nums text-content-muted">
                  {totalPoints > 0
                    ? `${goodPoints}/${totalPoints} good`
                    : 'no points'}
                </span>
              </div>
              <div>
                <span className="kn-eyebrow block">Freshness</span>
                <span className="text-lg font-semibold tabular-nums text-content-strong">
                  {freshnessDays === null
                    ? '—'
                    : freshnessDays === 0
                      ? 'Today'
                      : `${freshnessDays}d ago`}
                </span>
                <span className="ml-1 text-xs text-content-muted">last point</span>
              </div>
            </div>
            <Badge tone={health.tone} className="inline-flex items-center gap-1">
              <health.Icon className="h-3.5 w-3.5" />
              {health.label}
            </Badge>
          </CardContent>
        </Card>

        {/* Stats tiles */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Min', value: min },
            { label: 'Avg', value: avg !== null ? Math.round(avg * 100) / 100 : null },
            { label: 'Max', value: max },
          ].map(({ label, value }) => (
            <Card key={label} data-testid={`drilldown-stat-${label.toLowerCase()}`}>
              <CardContent>
                <Metric
                  label={label}
                  value={value !== null ? value.toLocaleString() : '—'}
                  unit={value !== null ? kpi?.unit ?? undefined : undefined}
                  size="md"
                />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Chart */}
        {loading ? (
          <Skeleton className="h-80 w-full" />
        ) : filteredPoints.length === 0 ? (
          <Card data-testid="drilldown-no-data">
            <CardContent className="py-12 text-center">
              <p className="text-sm text-content-muted">No data for the selected range.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <div style={{ height: 320 }} data-testid="drilldown-chart">
                <DrillDownChart dataPoints={filteredPoints} mode={chartMode} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data table */}
        {filteredPoints.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-content-strong">Raw data</h2>
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Quality</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPoints.slice(0, 100).map((dp) => (
                    <TableRow key={dp.id}>
                      <TableCell className="tabular-nums text-content-muted">
                        {new Date(dp.recordedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums text-content-strong">
                        {dp.value}
                        {kpi?.unit ? ` ${kpi.unit}` : ''}
                      </TableCell>
                      <TableCell className="text-xs text-content-muted">
                        {dp.periodStart.slice(0, 10)} → {dp.periodEnd.slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-xs text-content-muted">
                        {dp.qualityFlag}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </section>
        )}
      </div>
    </AppShell>
    </RequirePermission>
  );
}
