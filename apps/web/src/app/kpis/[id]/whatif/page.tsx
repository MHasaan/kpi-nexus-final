'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { AppShell } from '../../../../components/app-shell';
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
  Delta,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
} from '../../../../components/ui';
import { BarChart } from '../../../../components/charts';
import { ApiError, api, getAccessToken } from '../../../../lib/api-client';

interface WhatIfResult {
  baseline: number[];
  scenarios: Array<{ values: number[]; aggregateLift: number; aggregateLiftPct: number }>;
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

export default function WhatIfPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mechanic, setMechanic] = useState<'additive' | 'multiplicative'>('multiplicative');
  const [delta, setDelta] = useState('10');
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const scenario =
        mechanic === 'multiplicative'
          ? { mechanic, deltaPct: Number(delta) }
          : { mechanic, deltaAbsolute: Number(delta) };
      const res = await api<WhatIfResult>(`/kpis/${id}/whatif`, {
        method: 'POST',
        body: JSON.stringify({ scenarios: [scenario], baselineCount: 12 }),
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Simulation failed');
    } finally {
      setBusy(false);
    }
  };

  const sc = result?.scenarios[0];

  const beforeAfter = useMemo(() => {
    if (!result || !sc) return [];
    const baseSum = result.baseline.reduce((a, b) => a + b, 0);
    const scSum = sc.values.reduce((a, b) => a + b, 0);
    return [
      { label: 'Before', value: baseSum, color: 'hsl(var(--chart-2))' },
      { label: 'After', value: scSum, color: 'hsl(var(--accent-primary))' },
    ];
  }, [result, sc]);

  const crumbs = useMemo(() => ['KPIs', 'What-if'], []);

  return (
    <AppShell title="What-if" crumbs={crumbs}>
     <RequirePermission permission="ANALYTICS_VIEW">
      <PageHeader
        title="What-if simulator"
        subtitle="Explore how changing a driver moves this KPI. Assumes a linear relationship between driver and outcome."
      />

      <AnalyticsNav kpiId={id} active="whatif" />

      {error && (
        <p role="alert" data-testid="wi-error" className="mt-4 rounded-md border border-status-critical-bg bg-status-critical-bg px-3 py-2 text-sm text-status-critical">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Scenario</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wi-mechanic">Mechanic</Label>
              <Select
                id="wi-mechanic"
                data-testid="wi-mechanic"
                value={mechanic}
                onChange={(e) => setMechanic(e.target.value as 'additive' | 'multiplicative')}
              >
                <option value="multiplicative">multiplicative (%)</option>
                <option value="additive">additive (absolute)</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-delta">
                {mechanic === 'multiplicative' ? 'Delta %' : 'Delta (absolute)'}
              </Label>
              <Input
                id="wi-delta"
                data-testid="wi-delta"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="primary"
              className="w-full"
              data-testid="wi-run"
              onClick={run}
              isLoading={busy}
            >
              Simulate
            </Button>
            <p className="text-xs text-content-muted">Assumes a linear relationship.</p>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="space-y-6">
          {result && sc ? (
            <div data-testid="wi-result" className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <Metric label="Aggregate lift" value={sc.aggregateLift.toFixed(2)} size="md" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="kn-eyebrow">Lift %</span>
                    <span data-testid="wi-lift-pct">
                      <Delta value={sc.aggregateLiftPct} pct={sc.aggregateLiftPct} />
                    </span>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Before → after</CardTitle>
                </CardHeader>
                <CardContent>
                  <div data-testid="wi-chart">
                    <BarChart data={beforeAfter} aria-label="Aggregate before vs after the scenario" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Per-period projection</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead className="text-right">Baseline</TableHead>
                        <TableHead className="text-right">Scenario</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.baseline.map((b, i) => (
                        <TableRow key={i}>
                          <TableCell className="tabular-nums text-content-muted">{i + 1}</TableCell>
                          <TableCell className="text-right tabular-nums text-content-strong">
                            {b.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-content-strong">
                            {sc.values[i]?.toFixed(2) ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent>
                <EmptyState
                  icon={SlidersHorizontal}
                  title="No simulation yet"
                  description="Set a mechanic and delta, then run a simulation to see the projected impact."
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
     </RequirePermission>
    </AppShell>
  );
}
