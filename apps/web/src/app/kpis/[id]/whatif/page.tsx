'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { AppShell } from '../../../../components/app-shell';
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
import { currentLoginRedirect } from '../../../../lib/auth-redirect';
import { useFormat } from '../../../../lib/format-context';

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

/** Worked-out figures: two decimals at most. */
const figures = { maximumFractionDigits: 2 };

export default function WhatIfPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mechanic, setMechanic] = useState<'additive' | 'multiplicative'>('multiplicative');
  const [delta, setDelta] = useState('10');
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace(currentLoginRedirect());
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
  const fmt = useFormat();

  const beforeAfter = useMemo(() => {
    if (!result || !sc) return [];
    const baseSum = result.baseline.reduce((a, b) => a + b, 0);
    const scSum = sc.values.reduce((a, b) => a + b, 0);
    return [
      { label: 'As recorded', value: baseSum, color: 'hsl(var(--chart-2))' },
      { label: 'With the change', value: scSum, color: 'hsl(var(--accent-primary))' },
    ];
  }, [result, sc]);

  // Which KPI this is: in the top bar (a link back to it) and after the page's title.
  const heading = useKpiHeading(id, 'What-if simulator');

  return (
    <AppShell title="What-if" crumbs={heading.crumbs}>
     <RequirePermission permission="ANALYTICS_FORECAST">
      <PageHeader
        title={heading.title}
        subtitle="See what this KPI's recent values would add up to if each one were higher or lower by an amount you choose."
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
            <CardTitle>The change</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wi-mechanic">Change each value by</Label>
              <Select
                id="wi-mechanic"
                data-testid="wi-mechanic"
                value={mechanic}
                onChange={(e) => setMechanic(e.target.value as 'additive' | 'multiplicative')}
              >
                <option value="multiplicative">a percentage</option>
                <option value="additive">a fixed amount</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-delta">
                {mechanic === 'multiplicative' ? 'Percent' : 'Amount'}
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
              Work it out
            </Button>
            <p className="text-xs text-content-muted">
              Use a minus sign to lower the values. The change is applied to the last 12 recorded values. It is arithmetic on your own figures, not a prediction.
            </p>
          </CardContent>
        </Card>

        {/* Result */}
        <div className="space-y-6">
          {result && sc ? (
            <div data-testid="wi-result" className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <Metric label="Difference in the total" value={fmt.number(sc.aggregateLift, figures)} size="md" />
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="flex flex-col gap-1 p-4">
                    <span className="kn-eyebrow">Difference, in %</span>
                    <span data-testid="wi-lift-pct">
                      <Delta value={sc.aggregateLiftPct} pct={sc.aggregateLiftPct} decimals={1} />
                    </span>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>The total of those values</CardTitle>
                </CardHeader>
                <CardContent>
                  <div data-testid="wi-chart">
                    <BarChart data={beforeAfter} aria-label="The total as recorded, and with the change" />
                  </div>
                  {/* The two bars carried no words or figures: which was which was a guess. */}
                  <p className="mt-2 text-sm tabular-nums text-content" data-testid="wi-totals">
                    {beforeAfter.map((bar) => `${bar.label}: ${fmt.number(bar.value, figures)}`).join(' · ')}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Value by value</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Value</TableHead>
                        <TableHead className="text-right">As recorded</TableHead>
                        <TableHead className="text-right">With the change</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.baseline.map((b, i) => (
                        <TableRow key={i}>
                          <TableCell className="tabular-nums text-content-muted">{i + 1}</TableCell>
                          <TableCell className="text-right tabular-nums text-content-strong">
                            {fmt.number(b, figures)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-content-strong">
                            {sc.values[i] === undefined ? '—' : fmt.number(sc.values[i], figures)}
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
                  title="Nothing worked out yet"
                  description="Choose a change on the left and press Work it out."
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
