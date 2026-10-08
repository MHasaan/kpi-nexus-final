'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  attachCascade,
  computeBenchmark,
  createBenchmark,
  createTarget,
  createThresholdBand,
  deleteBenchmark,
  deleteCascade,
  deleteFormula,
  deleteTarget,
  deleteThresholdBand,
  getAccessToken,
  getFormula,
  getKpi,
  getKpiVersions,
  getLineageDownstream,
  getLineageUpstream,
  getThresholdStatus,
  listBenchmarks,
  listCascades,
  listKpiDataPoints,
  listKpis,
  listTargets,
  listThresholdBands,
  putFormula,
  recordOrgWideDataPoint,
  type Benchmark,
  type Cascade,
  type DataPoint,
  type KpiSummary,
  type KpiTarget,
  type KpiVersion,
  type LineageHop,
  type ThresholdBand,
} from '../../../lib/api-client';
import { CommentsDrawer } from '../../../components/comments-drawer';
import { AppShell } from '../../../components/app-shell';
import { RequirePermission } from '../../../components/auth/require-permission';
import {
  Badge,
  Button,
  Card as UICard,
  CardContent,
  Input,
  Label,
  ScopeBadge,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from '../../../components/ui';
import { LineChart } from '../../../components/charts';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

const TABS = ['Overview', 'Data', 'Formula', 'Cascade', 'Targets', 'Thresholds', 'Benchmarks', 'Lineage', 'Audit'] as const;
type Tab = (typeof TABS)[number];

export default function KpiDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const kpiId = params.id;

  const [tab, setTab] = useState<Tab>('Overview');
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    getKpi(kpiId)
      .then(setKpi)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load KPI'))
      .finally(() => setLoading(false));
  }, [kpiId, router]);

  if (loading) {
    return (
      <Shell kpiId={kpiId}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </Shell>
    );
  }
  if (error || !kpi) {
    return (
      <Shell kpiId={kpiId}>
        <div
          role="alert"
          className="rounded-lg border border-border bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
        >
          {error ?? 'Not found'}
        </div>
      </Shell>
    );
  }

  return (
    <Shell kpiId={kpiId} name={kpi.name}>
      <div className="mb-6">
        <Link href="/kpis" className="text-sm text-content-muted hover:text-content-strong">
          ← Back to KPIs
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-content-strong" data-testid="kpi-detail-name">
            {kpi.name}
          </h1>
          <Badge tone="neutral">{kpi.status}</Badge>
          <ScopeBadge scope={kpi.scope} />
          <span className="text-xs tabular-nums text-content-muted">
            v{kpi.version} · {kpi.type}
          </span>
          <span className="ml-auto">
            <CommentsDrawer entityType="kpi" entityId={kpiId} />
          </span>
        </div>
        {kpi.description && <p className="mt-1 text-sm text-content-muted">{kpi.description}</p>}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-6">
        <TabsList className="flex-wrap">
          {TABS.map((t) => (
            <span key={t} data-testid={`tab-${t.toLowerCase()}`}>
              <TabsTrigger value={t}>{t}</TabsTrigger>
            </span>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'Overview' && <OverviewTab kpi={kpi} />}
      {tab === 'Data' && <DataTab kpi={kpi} />}
      {tab === 'Formula' && <FormulaTab kpiId={kpiId} />}
      {tab === 'Cascade' && <CascadeTab kpiId={kpiId} />}
      {tab === 'Targets' && <TargetsTab kpiId={kpiId} />}
      {tab === 'Thresholds' && <ThresholdsTab kpiId={kpiId} />}
      {tab === 'Benchmarks' && <BenchmarksTab kpiId={kpiId} />}
      {tab === 'Lineage' && <LineageTab kpiId={kpiId} />}
      {tab === 'Audit' && <AuditTab kpiId={kpiId} />}
    </Shell>
  );
}

function Shell({ children, kpiId, name }: { children: React.ReactNode; kpiId: string; name?: string }) {
  return (
    <RequirePermission permission="KPI_VIEW">
      <AppShell
        title={name ?? 'KPI'}
        crumbs={[
          { label: 'Home', href: '/' },
          { label: 'KPIs', href: '/kpis' },
          { label: name ?? kpiId.slice(0, 8) },
        ]}
      >
        {children}
      </AppShell>
    </RequirePermission>
  );
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): [T | null, () => void] {
  const [data, setData] = useState<T | null>(null);
  const reload = useCallback(() => {
    fn().then(setData).catch(() => setData(null));
  }, deps);
  useEffect(reload, [reload]);
  return [data, reload];
}

// ---- Tabs ------------------------------------------------------------------

function OverviewTab({ kpi }: { kpi: KpiSummary }) {
  const [points] = useAsync(() => listKpiDataPoints(kpi.id), [kpi.id]);
  const [status] = useAsync(() => getThresholdStatus(kpi.id).catch(() => null), [kpi.id]);
  const latest = points?.[0];
  const series = (points ?? []).slice().reverse().map((p) => p.value);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Latest value</p>
            <p
              className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-content-strong"
              data-testid="overview-latest"
            >
              {latest ? `${latest.value}${kpi.unit ? ` ${kpi.unit}` : ''}` : '—'}
            </p>
            {latest && (
              <p className="mt-1 text-xs text-content-muted">
                recorded {new Date(latest.recordedAt).toLocaleDateString()}
              </p>
            )}
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Threshold status</p>
            <p className="mt-1 text-xl font-medium text-content-strong">
              {status?.band ?? status?.reason ?? '—'}
            </p>
          </CardContent>
        </UICard>
        <UICard>
          <CardContent>
            <p className="kn-eyebrow">Direction · Frequency</p>
            <p className="mt-1 text-sm text-content-strong">{kpi.direction}</p>
            <p className="text-sm text-content-muted">{kpi.frequency}</p>
          </CardContent>
        </UICard>
      </div>
      {series.length > 1 && (
        <UICard>
          <CardContent>
            <p className="kn-eyebrow mb-2">Trend</p>
            <LineChart
              series={[{ data: series }]}
              height={200}
              className="w-full"
              aria-label={`${kpi.name} trend over time`}
            />
          </CardContent>
        </UICard>
      )}
    </div>
  );
}

function DataTab({ kpi }: { kpi: KpiSummary }) {
  const [points, reload] = useAsync(() => listKpiDataPoints(kpi.id), [kpi.id]);
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const now = new Date().toISOString();
    try {
      if (kpi.scope !== 'ORG_WIDE') {
        setErr(`This KPI is ${kpi.scope}; record via its scope-specific endpoint.`);
        return;
      }
      await recordOrgWideDataPoint(kpi.id, { value: Number(value), periodStart: now, periodEnd: now });
      setValue('');
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to record');
    }
  };

  return (
    <div className="space-y-4">
      {kpi.scope === 'ORG_WIDE' && (
        <UICard>
          <CardContent>
            <form onSubmit={submit} className="flex items-end gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="data-value-input">New value</Label>
                <Input
                  id="data-value-input"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  type="number"
                  step="any"
                  required
                  data-testid="data-value"
                />
              </div>
              <Button type="submit" data-testid="data-record">
                Record
              </Button>
            </form>
            {err && <p className="mt-2 text-sm text-status-critical">{err}</p>}
          </CardContent>
        </UICard>
      )}
      <UICard className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Recorded</TableHead>
              <TableHead>Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(points ?? []).map((p: DataPoint) => (
              <TableRow key={p.id}>
                <TableCell className="tabular-nums">
                  {p.value}
                  {kpi.unit ? ` ${kpi.unit}` : ''}
                </TableCell>
                <TableCell className="text-content-muted">{new Date(p.periodStart).toLocaleDateString()}</TableCell>
                <TableCell className="text-content-muted">{new Date(p.recordedAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  {(p as DataPoint & { isOutlier?: boolean }).isOutlier ? (
                    <Badge tone="warning">outlier</Badge>
                  ) : p.sourceType === 'COMPUTED' ? (
                    <span className="text-xs text-content-muted">computed</span>
                  ) : (
                    ''
                  )}
                </TableCell>
              </TableRow>
            ))}
            {points && points.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-4 text-center text-content-muted">
                  No data points yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </UICard>
    </div>
  );
}

function TargetsTab({ kpiId }: { kpiId: string }) {
  const [targets, reload] = useAsync(() => listTargets(kpiId), [kpiId]);
  const [value, setValue] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await createTarget(kpiId, { type: 'STATIC', value: Number(value) });
      setValue('');
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add target');
    }
  };
  return (
    <div className="space-y-4">
      <UICard>
        <CardContent>
          <form onSubmit={add} className="flex items-end gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="target-value-input">Static target value</Label>
              <Input
                id="target-value-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type="number"
                step="any"
                required
                data-testid="target-value"
              />
            </div>
            <Button type="submit" data-testid="target-add">
              Add target
            </Button>
          </form>
          {err && (
            <p role="alert" data-testid="target-error" className="mt-2 text-sm text-status-critical">
              {err}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          {(targets ?? []).map((t: KpiTarget) => (
            <div
              key={t.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="tabular-nums text-content-strong">
                {t.type} {t.value ?? `${t.minValue}/${t.expectedValue}/${t.stretchValue}`}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteTarget(kpiId, t.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button>
            </div>
          ))}
          {targets && targets.length === 0 && <p className="py-3 text-center text-content-muted">No targets.</p>}
        </CardContent>
      </UICard>
    </div>
  );
}

function ThresholdsTab({ kpiId }: { kpiId: string }) {
  const [bands, reload] = useAsync(() => listThresholdBands(kpiId), [kpiId]);
  const [status] = useAsync(() => getThresholdStatus(kpiId).catch(() => null), [kpiId]);
  const [form, setForm] = useState({ name: '', lower: '', upper: '', color: '#16a34a', order: '0' });
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await createThresholdBand(kpiId, {
        name: form.name,
        lower: form.lower === '' ? null : Number(form.lower),
        upper: form.upper === '' ? null : Number(form.upper),
        color: form.color,
        order: Number(form.order),
      });
      setForm({ name: '', lower: '', upper: '', color: '#16a34a', order: '0' });
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add band');
    }
  };
  return (
    <div className="space-y-4">
      <UICard>
        <CardContent>
          <p className="text-sm text-content-muted">
            Current band:{' '}
            <span className="font-medium text-content-strong">{status?.band ?? status?.reason ?? '—'}</span>
          </p>
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <form onSubmit={add} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Input
              placeholder="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              data-testid="band-name"
            />
            <Input
              placeholder="lower"
              value={form.lower}
              onChange={(e) => setForm({ ...form, lower: e.target.value })}
              type="number"
              step="any"
            />
            <Input
              placeholder="upper"
              value={form.upper}
              onChange={(e) => setForm({ ...form, upper: e.target.value })}
              type="number"
              step="any"
            />
            <Input
              value={form.order}
              onChange={(e) => setForm({ ...form, order: e.target.value })}
              type="number"
            />
            <Button type="submit" data-testid="band-add">
              Add band
            </Button>
          </form>
          {err && (
            <p role="alert" data-testid="band-error" className="mt-2 text-sm text-status-critical">
              {err}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          {(bands ?? []).map((b: ThresholdBand) => (
            <div
              key={b.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: b.color }} />
                <span className="text-content-strong">{b.name}</span>
                <span className="tabular-nums text-content-muted">
                  [{b.lower ?? '−∞'}, {b.upper ?? '∞'}]
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteThresholdBand(kpiId, b.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button>
            </div>
          ))}
          {bands && bands.length === 0 && <p className="py-3 text-center text-content-muted">No bands.</p>}
        </CardContent>
      </UICard>
    </div>
  );
}

function BenchmarksTab({ kpiId }: { kpiId: string }) {
  const [benchmarks, reload] = useAsync(() => listBenchmarks(kpiId), [kpiId]);
  const [form, setForm] = useState({ kind: 'EXTERNAL_INDUSTRY', value: '', source: '' });
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await createBenchmark(kpiId, { kind: form.kind, value: Number(form.value), source: form.source || undefined });
      setForm({ kind: 'EXTERNAL_INDUSTRY', value: '', source: '' });
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to add benchmark');
    }
  };
  const compute = async () => {
    setErr(null);
    try {
      await computeBenchmark(kpiId, 30);
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to compute benchmark');
    }
  };
  return (
    <div className="space-y-4">
      <UICard>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-content-muted">Benchmarks compare this KPI to reference values.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void compute()}
              data-testid="benchmark-compute"
            >
              Auto-compute (30d)
            </Button>
          </div>
          <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="EXTERNAL_INDUSTRY">Industry</option>
              <option value="EXTERNAL_PEER">Peer</option>
            </Select>
            <Input
              placeholder="value"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              type="number"
              step="any"
              required
              data-testid="benchmark-value"
            />
            <Input
              placeholder="source"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
            <Button type="submit" data-testid="benchmark-add">
              Add
            </Button>
          </form>
          {err && (
            <p role="alert" data-testid="benchmark-error" className="mt-2 text-sm text-status-critical">
              {err}
            </p>
          )}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          {(benchmarks ?? []).map((b: Benchmark) => (
            <div
              key={b.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="tabular-nums text-content-strong">
                {b.kind}: {b.value} {b.source && <span className="text-content-muted">({b.source})</span>}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteBenchmark(kpiId, b.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Delete
              </Button>
            </div>
          ))}
          {benchmarks && benchmarks.length === 0 && (
            <p className="py-3 text-center text-content-muted">No benchmarks.</p>
          )}
        </CardContent>
      </UICard>
    </div>
  );
}

function LineageTab({ kpiId }: { kpiId: string }) {
  const [up] = useAsync(() => getLineageUpstream('kpi', kpiId, 3), [kpiId]);
  const [down] = useAsync(() => getLineageDownstream('kpi', kpiId, 3), [kpiId]);
  const col = (title: string, hops: LineageHop[] | null) => (
    <UICard>
      <CardContent>
        <p className="kn-eyebrow mb-2">{title}</p>
        {(hops ?? []).map((h) => (
          <div key={h.edgeId} className="border-b border-border-divider py-2 text-sm last:border-0">
            <span className="font-mono text-content-strong">
              {h.type}:{h.id.slice(0, 8)}
            </span>
            <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-content-muted">{h.via}</span>
          </div>
        ))}
        {hops && hops.length === 0 && <p className="py-2 text-content-muted">None.</p>}
      </CardContent>
    </UICard>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {col('Upstream (inputs)', up)}
      {col('Downstream (consumers)', down)}
    </div>
  );
}

function FormulaTab({ kpiId }: { kpiId: string }) {
  const [formula, reload] = useAsync(() => getFormula(kpiId).catch(() => null), [kpiId]);
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (formula) setRaw(formula.raw);
  }, [formula]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await putFormula(kpiId, raw);
      setMsg('Formula saved.');
      reload();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to save formula');
    }
  };
  const clear = async () => {
    setErr(null);
    setMsg(null);
    await deleteFormula(kpiId).catch(() => undefined);
    setRaw('');
    reload();
  };
  return (
    <UICard>
      <CardContent>
        <p className="text-sm text-content-muted">
          A formula derives this KPI from other KPIs (referenced by name). Example:{' '}
          <code className="rounded bg-surface-2 px-1 font-mono">revenue - cost</code>
        </p>
        <form onSubmit={save} className="mt-3 space-y-3">
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={3}
            className="font-mono"
            placeholder="revenue - cost"
            data-testid="formula-raw"
          />
          <div className="flex gap-2">
            <Button type="submit" data-testid="formula-save">
              Save formula
            </Button>
            {formula && (
              <Button type="button" variant="secondary" onClick={clear}>
                Clear
              </Button>
            )}
          </div>
        </form>
        {msg && (
          <p className="mt-2 text-sm text-status-positive" data-testid="formula-msg">
            {msg}
          </p>
        )}
        {err && (
          <p className="mt-2 text-sm text-status-critical" data-testid="formula-err">
            {err}
          </p>
        )}
      </CardContent>
    </UICard>
  );
}

function CascadeTab({ kpiId }: { kpiId: string }) {
  const [edges, reload] = useAsync(() => listCascades(), [kpiId]);
  const [names] = useAsync(
    () => listKpis().then((ks) => Object.fromEntries(ks.map((k) => [k.id, k.name]))),
    [kpiId],
  );
  const nm = (id: string) => names?.[id] ?? id.slice(0, 8);
  const parents = (edges ?? []).filter((e: Cascade) => e.childKpiId === kpiId);
  const children = (edges ?? []).filter((e: Cascade) => e.parentKpiId === kpiId);
  const totalWeight = children.reduce((s, c) => s + c.weight, 0);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <UICard>
        <CardContent>
          <p className="kn-eyebrow mb-2">Rolls up into (parents)</p>
          {parents.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="text-content-strong">{nm(e.parentKpiId)}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteCascade(e.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Detach
              </Button>
            </div>
          ))}
          {parents.length === 0 && <p className="py-2 text-content-muted">No parents.</p>}
        </CardContent>
      </UICard>
      <UICard>
        <CardContent>
          <p className="kn-eyebrow mb-2">Children (weight {totalWeight})</p>
          {children.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between border-b border-border-divider py-2 text-sm last:border-0"
            >
              <span className="text-content-strong">
                {nm(e.childKpiId)} <span className="tabular-nums text-content-muted">· {e.method} · w{e.weight}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteCascade(e.id).then(reload)}
                className="text-status-critical hover:bg-status-critical-bg"
              >
                Detach
              </Button>
            </div>
          ))}
          {children.length === 0 && <p className="py-2 text-content-muted">No children.</p>}
          <AddChildForm kpiId={kpiId} names={names} onAdded={reload} />
        </CardContent>
      </UICard>
    </div>
  );
}

function AddChildForm({
  kpiId,
  names,
  onAdded,
}: {
  kpiId: string;
  names: Record<string, string> | null;
  onAdded: () => void;
}) {
  const [childKpiId, setChildKpiId] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const options = Object.entries(names ?? {}).filter(([id]) => id !== kpiId);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!childKpiId) return;
    setErr(null);
    try {
      await attachCascade({ parentKpiId: kpiId, childKpiId, method: 'SUM' });
      setChildKpiId('');
      onAdded();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Failed to attach child');
    }
  };
  return (
    <>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <Select
          value={childKpiId}
          onChange={(e) => setChildKpiId(e.target.value)}
          className="flex-1"
          data-testid="cascade-child"
        >
          <option value="">Add child KPI…</option>
          {options.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Button type="submit" data-testid="cascade-add">
          Attach
        </Button>
      </form>
      {err && (
        <p role="alert" data-testid="cascade-error" className="mt-2 text-sm text-status-critical">
          {err}
        </p>
      )}
    </>
  );
}

function AuditTab({ kpiId }: { kpiId: string }) {
  const [versions] = useAsync(() => getKpiVersions(kpiId), [kpiId]);
  return (
    <UICard className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(versions ?? []).map((v: KpiVersion) => (
            <TableRow key={v.id}>
              <TableCell className="tabular-nums">v{v.version}</TableCell>
              <TableCell className="text-content-muted">{v.reason ?? '—'}</TableCell>
              <TableCell className="text-content-muted">{new Date(v.createdAt).toLocaleString()}</TableCell>
            </TableRow>
          ))}
          {versions && versions.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="py-3 text-center text-content-muted">
                No versions.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </UICard>
  );
}
