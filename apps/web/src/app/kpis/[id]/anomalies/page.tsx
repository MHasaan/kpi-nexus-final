'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { AppShell } from '../../../../components/app-shell';
import { RequirePermission } from '../../../../components/auth/require-permission';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Label,
  Select,
  Input,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Skeleton,
  EmptyState,
} from '../../../../components/ui';
import { LineChart } from '../../../../components/charts';
import { ApiError, api, getAccessToken } from '../../../../lib/api-client';

interface DataPoint {
  value: number;
  recordedAt: string;
}
interface Detected {
  index: number;
  score: number;
  dataPointId: string | null;
  id?: string;
}
interface Anomaly {
  id: string;
  score: number;
  method: string;
  isConfirmed: boolean;
  detectedAt: string;
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

export default function AnomaliesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [series, setSeries] = useState<number[]>([]);
  const [detected, setDetected] = useState<Detected[] | null>(null);
  const [saved, setSaved] = useState<Anomaly[]>([]);
  const [method, setMethod] = useState('ensemble');
  const [threshold, setThreshold] = useState('3');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      api<DataPoint[]>(`/kpis/${id}/data?limit=365`),
      api<Anomaly[]>(`/kpis/${id}/anomalies`),
    ])
      .then(([dataRes, savedRes]) => {
        if (dataRes.status === 'fulfilled') {
          setSeries([...dataRes.value].reverse().map((r) => r.value));
        } else {
          setError(
            dataRes.reason instanceof ApiError ? dataRes.reason.message : 'Failed to load series',
          );
        }
        if (savedRes.status === 'fulfilled') setSaved(savedRes.value);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  const detect = async (persist: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ anomalies: Detected[] }>(`/kpis/${id}/anomalies/detect`, {
        method: 'POST',
        body: JSON.stringify({ method, threshold: Number(threshold), persist }),
      });
      setDetected(res.anomalies);
      if (persist) load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Detection failed');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (anomalyId: string) => {
    try {
      await api(`/kpis/${id}/anomalies/${anomalyId}/confirm`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Confirm failed');
    }
  };

  const anomalyMarkers = useMemo(
    () =>
      (detected ?? []).map((a) => ({
        index: a.index,
        value: series[a.index] ?? 0,
        label: `Score ${a.score.toFixed(2)}`,
      })),
    [detected, series],
  );

  const crumbs = useMemo(() => ['KPIs', 'Anomalies'], []);

  return (
    <AppShell title="Anomalies" crumbs={crumbs}>
     <RequirePermission permission="ANALYTICS_VIEW">
      <PageHeader
        title="Anomaly detection"
        subtitle="Surface anomalous data points with shape + colour markers and persist confirmed anomalies."
      />

      <AnalyticsNav kpiId={id} active="anomalies" />

      {error && (
        <p role="alert" data-testid="anom-error" className="mt-4 rounded-md border border-status-critical-bg bg-status-critical-bg px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Detection controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="anom-method">Method</Label>
              <Select
                id="anom-method"
                data-testid="anom-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {['ensemble', 'zscore', 'ewma', 'isolation_forest'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="anom-threshold">Threshold</Label>
              <Input
                id="anom-threshold"
                data-testid="anom-threshold"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                data-testid="anom-detect"
                onClick={() => detect(false)}
                isLoading={busy}
              >
                Detect
              </Button>
              <Button
                type="button"
                variant="primary"
                data-testid="anom-detect-persist"
                onClick={() => detect(true)}
                isLoading={busy}
              >
                Detect &amp; save
              </Button>
            </div>
            <p className="text-xs text-content-muted">
              Markers are shape + colour (never colour-only). Tooltip shows the anomaly score.
            </p>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-6" data-testid="anom-detected">
          <Card>
            <CardHeader>
              <CardTitle>KPI trend</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[220px] w-full" data-testid="anom-chart" />
              ) : series.length === 0 ? (
                <div data-testid="anom-chart">
                  <EmptyState
                    title="No data to analyse"
                    description="Record KPI values before running anomaly detection."
                  />
                </div>
              ) : (
                <div data-testid="anom-chart">
                  <LineChart
                    series={[{ data: series }]}
                    anomalies={anomalyMarkers}
                    height={220}
                    aria-label="KPI trend with anomaly markers"
                    className="text-chart-1"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {detected && (
            <Card>
              <CardHeader>
                <CardTitle>Live detection</CardTitle>
              </CardHeader>
              <CardContent>
                {detected.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-status-success">
                    <ShieldCheck aria-hidden className="h-4 w-4" />
                    No anomalies detected — the series looks healthy.
                  </p>
                ) : (
                  <p className="text-sm text-content">
                    Detected{' '}
                    <span className="font-semibold tabular-nums text-content-strong">
                      {detected.length}
                    </span>{' '}
                    anomal{detected.length === 1 ? 'y' : 'ies'} in the current series.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Saved anomalies</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : saved.length === 0 ? (
                <div data-testid="anom-saved">
                  <EmptyState
                    icon={ShieldCheck}
                    title="No anomalies detected"
                    description="Saved detections will appear here once you persist a run."
                  />
                </div>
              ) : (
                <Table data-testid="anom-saved">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Score</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {saved.map((a) => (
                      <TableRow key={a.id} data-testid={`anom-row-${a.id}`}>
                        <TableCell className="tabular-nums text-content-strong">
                          {a.score.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-content-muted">
                          {a.method}
                        </TableCell>
                        <TableCell className="text-right">
                          {a.isConfirmed ? (
                            <Badge tone="success" data-testid={`anom-confirmed-${a.id}`}>
                              Confirmed
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              data-testid={`anom-confirm-${a.id}`}
                              onClick={() => confirm(a.id)}
                            >
                              Confirm
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
     </RequirePermission>
    </AppShell>
  );
}
