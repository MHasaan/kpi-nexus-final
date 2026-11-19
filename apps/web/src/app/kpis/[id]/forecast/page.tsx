'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart as LineChartIcon } from 'lucide-react';

import { AppShell } from '../../../../components/app-shell';
import { forecastPeriodStart } from '../../../../lib/forecast-periods';
import { useFormat } from '../../../../lib/format-context';
import { useKpiHeading } from '../../../../lib/use-kpi-heading';
import { RequirePermission } from '../../../../components/auth/require-permission';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Label,
  Select,
  Input,
  Metric,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from '../../../../components/ui';
import { LineChart } from '../../../../components/charts';
import { ApiError, api, getAccessToken } from '../../../../lib/api-client';
import { horizonProblem } from '../../../../lib/form-checks';
import { FORECAST_MODELS, forecastFallbackNotice, forecastModelLabel } from '../../../../lib/forecast-model';
import { currentLoginRedirect } from '../../../../lib/auth-redirect';

interface Prediction {
  ds: string;
  yhat: number;
  yhat_lower_80: number;
  yhat_upper_80: number;
  yhat_lower_95: number;
  yhat_upper_95: number;
}
interface Forecast {
  model: string;
  horizon: number;
  predictions: Prediction[];
  fitMetrics?: { rmse?: number; mape?: number };
}
interface DataPoint {
  value: number;
  periodStart: string;
  recordedAt: string;
}

// Shared analytics navigation strip — lets users move between the KPI's
// analytics surfaces and back to the detail page.
function AnalyticsNav({ kpiId, active }: { kpiId: string; active: string }) {
  const links: Array<{ key: string; label: string; href: string }> = [
    { key: 'detail', label: 'Overview', href: `/kpis/${kpiId}` },
    { key: 'forecast', label: 'Forecast', href: `/kpis/${kpiId}/forecast` },
    { key: 'anomalies', label: 'Anomalies', href: `/kpis/${kpiId}/anomalies` },
    { key: 'whatif', label: 'What-if', href: `/kpis/${kpiId}/whatif` },
    { key: 'embed', label: 'Embed', href: `/kpis/${kpiId}/embed` },
  ];
  return (
    <nav
      aria-label="KPI analytics"
      data-testid="analytics-nav"
      className="mt-4 flex flex-wrap gap-1 rounded-lg border border-border bg-surface-1 p-1"
    >
      {links.map((l) => {
        const isActive = l.key === active;
        return (
          <Link
            key={l.key}
            href={l.href}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-content-muted hover:bg-surface-2 hover:text-content-strong'
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** A forecast is an estimate: two decimals at most, not the six a model returns. */
const figures = { maximumFractionDigits: 2 };

export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [horizon, setHorizon] = useState('14');
  const [model, setModel] = useState('naive');
  // The model the shown forecast was asked for — the picker may have moved on since.
  const [asked, setAsked] = useState<string | null>(null);
  const [fc, setFc] = useState<Forecast | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  // The start of the newest recorded period: the forecast's periods are counted on from it.
  const [lastPeriodStart, setLastPeriodStart] = useState<string | null>(null);
  const fmt = useFormat();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setLoading(true);
    api<DataPoint[]>(`/kpis/${id}/data?limit=365`)
      .then((rows) => {
        setHistory([...rows].reverse().map((r) => r.value));
        setLastPeriodStart(rows.reduce<string | null>((latest, r) => (latest === null || r.periodStart > latest ? r.periodStart : latest), null));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load history'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    loadHistory();
  }, [loadHistory, router]);

  const run = async () => {
    // Say what is wrong before asking for anything (plan 7.4).
    const problem = horizonProblem(horizon);
    setError(problem);
    if (problem) return;
    setBusy(true);
    try {
      const res = await api<Forecast>(`/kpis/${id}/forecasts`, {
        method: 'POST',
        body: JSON.stringify({ horizon: Number(horizon), model }),
      });
      setFc(res);
      setAsked(model);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Forecast failed');
    } finally {
      setBusy(false);
    }
  };

  const fallbackNotice = fc && asked ? forecastFallbackNotice(asked, fc.model) : null;

  const forecastBand = useMemo(() => {
    if (!fc) return undefined;
    return {
      yhat: fc.predictions.map((p) => p.yhat),
      lower: fc.predictions.map((p) => p.yhat_lower_95),
      upper: fc.predictions.map((p) => p.yhat_upper_95),
    };
  }, [fc]);

  // Which KPI this is: in the top bar (a link back to it) and after the page's title.
  const heading = useKpiHeading(id, 'Forecast');

  return (
    <AppShell title="Forecast" crumbs={heading.crumbs}>
     <RequirePermission permission="ANALYTICS_FORECAST">
      <PageHeader
        title={heading.title}
        subtitle="Where this KPI is heading if it keeps moving as it has. The dashed line is the forecast; the shaded band is the range it will very probably stay within (95%)."
      />

      <AnalyticsNav kpiId={id} active="forecast" />

      {error && (
        <p role="alert" data-testid="fc-error" className="mt-4 rounded-md border border-status-critical-bg bg-status-critical-bg px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Forecast controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fc-model">Model</Label>
              <Select id="fc-model" data-testid="fc-model" value={model} onChange={(e) => setModel(e.target.value)}>
                {/* With too little history the service runs the simple trend
                    instead; the result says so (OT-005, QA-M9). */}
                {FORECAST_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-content-muted">{FORECAST_MODELS.find((m) => m.value === model)?.about}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fc-horizon">How many periods ahead</Label>
              <Input
                id="fc-horizon"
                data-testid="fc-horizon"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              data-testid="fc-run"
              onClick={run}
              isLoading={busy}
            >
              Generate forecast
            </Button>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Projection</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[240px] w-full" data-testid="fc-chart" />
              ) : fc || history.length > 0 ? (
                <div data-testid="fc-chart">
                  <LineChart
                    series={history.length > 0 ? [{ data: history, label: 'Actual' }] : []}
                    forecast={forecastBand}
                    height={240}
                    aria-label="Historical actuals with forecast and confidence band"
                  />
                </div>
              ) : (
                <div data-testid="fc-chart">
                  <EmptyState
                    icon={LineChartIcon}
                    title="No forecast yet"
                    description="Pick a model and horizon, then generate a forecast to see projected values."
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {fc && (
            <>
              {fallbackNotice && (
                <div role="status" data-testid="fc-fallback" className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-content-strong">
                  {fallbackNotice}
                </div>
              )}
              <div className="grid grid-cols-3 gap-4" data-testid="fc-metrics">
                <Card>
                  <CardContent className="p-4">
                    <Metric label="Model that ran" value={forecastModelLabel(fc.model)} size="sm" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <Metric
                      label="Typical miss (RMSE)"
                      value={fc.fitMetrics?.rmse !== undefined ? fmt.number(fc.fitMetrics.rmse, { maximumFractionDigits: 2 }) : '—'}
                      size="sm"
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <Metric
                      label="Typical miss, in % (MAPE)"
                      value={
                        fc.fitMetrics?.mape !== undefined ? fc.fitMetrics.mape.toFixed(1) : '—'
                      }
                      unit={fc.fitMetrics?.mape !== undefined ? '%' : undefined}
                      size="sm"
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Period by period</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table data-testid="fc-predictions">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Forecast</TableHead>
                        <TableHead className="text-right">Likely range (80%)</TableHead>
                        <TableHead className="text-right">Wider range (95%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fc.predictions.map((p, i) => {
                        // The service numbers its rows "t+1", "t+2": the period that many after the last one recorded.
                        const start = forecastPeriodStart(lastPeriodStart, heading.kpi?.frequency, i + 1);
                        const range = (low: number, high: number) => `${fmt.number(low, figures)} – ${fmt.number(high, figures)}`;
                        return (
                          <TableRow key={p.ds}>
                            <TableCell className="tabular-nums text-content">
                              {start ? fmt.day(start) : `${i + 1} ${i === 0 ? 'period' : 'periods'} ahead`}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-content-strong">{fmt.number(p.yhat, figures)}</TableCell>
                            <TableCell className="text-right tabular-nums text-content-muted">{range(p.yhat_lower_80, p.yhat_upper_80)}</TableCell>
                            <TableCell className="text-right tabular-nums text-content-muted">{range(p.yhat_lower_95, p.yhat_upper_95)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
     </RequirePermission>
    </AppShell>
  );
}
