'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  ApiError,
  computeBenchmark,
  createBenchmark,
  createTarget,
  createThresholdBand,
  deleteBenchmark,
  deleteTarget,
  deleteThresholdBand,
  getAccessToken,
  getKpi,
  getLineageDownstream,
  getLineageUpstream,
  getThresholdStatus,
  listBenchmarks,
  listKpiDataPoints,
  listTargets,
  listThresholdBands,
  recordOrgWideDataPoint,
  type Benchmark,
  type DataPoint,
  type KpiSummary,
  type KpiTarget,
  type LineageHop,
  type ThresholdBand,
} from '../../../lib/api-client';

const TABS = ['Overview', 'Data', 'Targets', 'Thresholds', 'Benchmarks', 'Lineage'] as const;
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
      router.replace('/login');
      return;
    }
    getKpi(kpiId)
      .then(setKpi)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load KPI'))
      .finally(() => setLoading(false));
  }, [kpiId, router]);

  if (loading) return <Shell><p className="text-content-muted">Loading…</p></Shell>;
  if (error || !kpi) return <Shell><p className="text-status-critical">{error ?? 'Not found'}</p></Shell>;

  return (
    <Shell>
      <div className="mb-6">
        <Link href="/kpis" className="text-sm text-content-muted hover:text-content-strong">← Back to KPIs</Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-content-strong" data-testid="kpi-detail-name">{kpi.name}</h1>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-content-muted">{kpi.status}</span>
          <span className="text-xs text-content-muted">v{kpi.version} · {kpi.scope} · {kpi.type}</span>
        </div>
        {kpi.description && <p className="mt-1 text-sm text-content-muted">{kpi.description}</p>}
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t ? 'border-accent-primary font-medium text-accent-primary' : 'border-transparent text-content-muted hover:text-content-strong'}`}
            data-testid={`tab-${t.toLowerCase()}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab kpi={kpi} />}
      {tab === 'Data' && <DataTab kpi={kpi} />}
      {tab === 'Targets' && <TargetsTab kpiId={kpiId} />}
      {tab === 'Thresholds' && <ThresholdsTab kpiId={kpiId} />}
      {tab === 'Benchmarks' && <BenchmarksTab kpiId={kpiId} />}
      {tab === 'Lineage' && <LineageTab kpiId={kpiId} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-surface-1 p-5">{children}</div>;
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
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Card>
        <p className="text-xs uppercase tracking-wide text-content-muted">Latest value</p>
        <p className="mt-1 text-3xl font-semibold text-content-strong" data-testid="overview-latest">
          {latest ? `${latest.value}${kpi.unit ? ` ${kpi.unit}` : ''}` : '—'}
        </p>
        {latest && <p className="mt-1 text-xs text-content-muted">recorded {new Date(latest.recordedAt).toLocaleDateString()}</p>}
      </Card>
      <Card>
        <p className="text-xs uppercase tracking-wide text-content-muted">Threshold status</p>
        <p className="mt-1 text-xl font-medium text-content-strong">{status?.band ?? status?.reason ?? '—'}</p>
      </Card>
      <Card>
        <p className="text-xs uppercase tracking-wide text-content-muted">Direction · Frequency</p>
        <p className="mt-1 text-sm text-content-strong">{kpi.direction}</p>
        <p className="text-sm text-content-muted">{kpi.frequency}</p>
      </Card>
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
        <Card>
          <form onSubmit={submit} className="flex items-end gap-3">
            <label className="flex-1">
              <span className="block text-xs text-content-muted">New value</span>
              <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="any" required
                className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" data-testid="data-value" />
            </label>
            <button type="submit" className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white" data-testid="data-record">Record</button>
          </form>
          {err && <p className="mt-2 text-sm text-status-critical">{err}</p>}
        </Card>
      )}
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-content-muted"><th className="py-2">Value</th><th>Period</th><th>Recorded</th><th>Flags</th></tr></thead>
          <tbody>
            {(points ?? []).map((p: DataPoint) => (
              <tr key={p.id} className="border-t border-border">
                <td className="py-2 text-content-strong">{p.value}{kpi.unit ? ` ${kpi.unit}` : ''}</td>
                <td className="text-content-muted">{new Date(p.periodStart).toLocaleDateString()}</td>
                <td className="text-content-muted">{new Date(p.recordedAt).toLocaleDateString()}</td>
                <td>{(p as DataPoint & { isOutlier?: boolean }).isOutlier ? <span className="rounded bg-status-warning/20 px-1.5 py-0.5 text-xs text-status-warning">outlier</span> : p.sourceType === 'COMPUTED' ? <span className="text-xs text-content-muted">computed</span> : ''}</td>
              </tr>
            ))}
            {points && points.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-content-muted">No data points yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TargetsTab({ kpiId }: { kpiId: string }) {
  const [targets, reload] = useAsync(() => listTargets(kpiId), [kpiId]);
  const [value, setValue] = useState('');
  const add = async (e: FormEvent) => {
    e.preventDefault();
    await createTarget(kpiId, { type: 'STATIC', value: Number(value) }).catch(() => undefined);
    setValue('');
    reload();
  };
  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={add} className="flex items-end gap-3">
          <label className="flex-1"><span className="block text-xs text-content-muted">Static target value</span>
            <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="any" required
              className="mt-1 w-full rounded-md border border-border bg-surface-bg px-3 py-2 text-sm text-content-strong" data-testid="target-value" /></label>
          <button className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white" data-testid="target-add">Add target</button>
        </form>
      </Card>
      <Card>
        {(targets ?? []).map((t: KpiTarget) => (
          <div key={t.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <span className="text-content-strong">{t.type} {t.value ?? `${t.minValue}/${t.expectedValue}/${t.stretchValue}`}</span>
            <button onClick={() => deleteTarget(kpiId, t.id).then(reload)} className="text-xs text-status-critical hover:underline">Delete</button>
          </div>
        ))}
        {targets && targets.length === 0 && <p className="py-3 text-center text-content-muted">No targets.</p>}
      </Card>
    </div>
  );
}

function ThresholdsTab({ kpiId }: { kpiId: string }) {
  const [bands, reload] = useAsync(() => listThresholdBands(kpiId), [kpiId]);
  const [status] = useAsync(() => getThresholdStatus(kpiId).catch(() => null), [kpiId]);
  const [form, setForm] = useState({ name: '', lower: '', upper: '', color: '#16a34a', order: '0' });
  const add = async (e: FormEvent) => {
    e.preventDefault();
    await createThresholdBand(kpiId, {
      name: form.name,
      lower: form.lower === '' ? null : Number(form.lower),
      upper: form.upper === '' ? null : Number(form.upper),
      color: form.color,
      order: Number(form.order),
    }).catch(() => undefined);
    setForm({ name: '', lower: '', upper: '', color: '#16a34a', order: '0' });
    reload();
  };
  return (
    <div className="space-y-4">
      <Card><p className="text-sm text-content-muted">Current band: <span className="font-medium text-content-strong">{status?.band ?? status?.reason ?? '—'}</span></p></Card>
      <Card>
        <form onSubmit={add} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <input placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm" data-testid="band-name" />
          <input placeholder="lower" value={form.lower} onChange={(e) => setForm({ ...form, lower: e.target.value })} type="number" step="any" className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm" />
          <input placeholder="upper" value={form.upper} onChange={(e) => setForm({ ...form, upper: e.target.value })} type="number" step="any" className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm" />
          <input value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} type="number" className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm" />
          <button className="rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white" data-testid="band-add">Add band</button>
        </form>
      </Card>
      <Card>
        {(bands ?? []).map((b: ThresholdBand) => (
          <div key={b.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: b.color }} /><span className="text-content-strong">{b.name}</span><span className="text-content-muted">[{b.lower ?? '−∞'}, {b.upper ?? '∞'}]</span></span>
            <button onClick={() => deleteThresholdBand(kpiId, b.id).then(reload)} className="text-xs text-status-critical hover:underline">Delete</button>
          </div>
        ))}
        {bands && bands.length === 0 && <p className="py-3 text-center text-content-muted">No bands.</p>}
      </Card>
    </div>
  );
}

function BenchmarksTab({ kpiId }: { kpiId: string }) {
  const [benchmarks, reload] = useAsync(() => listBenchmarks(kpiId), [kpiId]);
  const [form, setForm] = useState({ kind: 'EXTERNAL_INDUSTRY', value: '', source: '' });
  const add = async (e: FormEvent) => {
    e.preventDefault();
    await createBenchmark(kpiId, { kind: form.kind, value: Number(form.value), source: form.source || undefined }).catch(() => undefined);
    setForm({ kind: 'EXTERNAL_INDUSTRY', value: '', source: '' });
    reload();
  };
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm text-content-muted">Benchmarks compare this KPI to reference values.</p>
          <button onClick={() => computeBenchmark(kpiId, 30).then(reload).catch(() => undefined)} className="rounded-md border border-border px-3 py-1.5 text-sm text-content-strong hover:bg-surface-bg" data-testid="benchmark-compute">Auto-compute (30d)</button>
        </div>
        <form onSubmit={add} className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm">
            <option value="EXTERNAL_INDUSTRY">Industry</option>
            <option value="EXTERNAL_PEER">Peer</option>
          </select>
          <input placeholder="value" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} type="number" step="any" required className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm" data-testid="benchmark-value" />
          <input placeholder="source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="rounded-md border border-border bg-surface-bg px-3 py-2 text-sm" />
          <button className="rounded-md bg-accent-primary px-3 py-2 text-sm font-medium text-white" data-testid="benchmark-add">Add</button>
        </form>
      </Card>
      <Card>
        {(benchmarks ?? []).map((b: Benchmark) => (
          <div key={b.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
            <span className="text-content-strong">{b.kind}: {b.value} {b.source && <span className="text-content-muted">({b.source})</span>}</span>
            <button onClick={() => deleteBenchmark(kpiId, b.id).then(reload)} className="text-xs text-status-critical hover:underline">Delete</button>
          </div>
        ))}
        {benchmarks && benchmarks.length === 0 && <p className="py-3 text-center text-content-muted">No benchmarks.</p>}
      </Card>
    </div>
  );
}

function LineageTab({ kpiId }: { kpiId: string }) {
  const [up] = useAsync(() => getLineageUpstream('kpi', kpiId, 3), [kpiId]);
  const [down] = useAsync(() => getLineageDownstream('kpi', kpiId, 3), [kpiId]);
  const col = (title: string, hops: LineageHop[] | null) => (
    <Card>
      <p className="mb-2 text-xs uppercase tracking-wide text-content-muted">{title}</p>
      {(hops ?? []).map((h) => (
        <div key={h.edgeId} className="border-b border-border py-2 text-sm last:border-0">
          <span className="text-content-strong">{h.type}:{h.id.slice(0, 8)}</span>
          <span className="ml-2 rounded bg-surface-bg px-1.5 py-0.5 text-xs text-content-muted">{h.via}</span>
        </div>
      ))}
      {hops && hops.length === 0 && <p className="py-2 text-content-muted">None.</p>}
    </Card>
  );
  return <div className="grid gap-4 sm:grid-cols-2">{col('Upstream (inputs)', up)}{col('Downstream (consumers)', down)}</div>;
}
