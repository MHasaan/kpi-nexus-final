'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SeriesChart } from '../../../../components/series-chart';
import { ApiError, api, getAccessToken } from '../../../../lib/api-client';

interface WhatIfResult {
  baseline: number[];
  scenarios: Array<{ values: number[]; aggregateLift: number; aggregateLiftPct: number }>;
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

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href={`/kpis/${id}`} className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">What-if</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">What-if simulator</h1>
        {error && <p className="text-sm text-status-critical" data-testid="wi-error">{error}</p>}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-1 p-4">
          <label className="text-xs text-content-muted">
            Mechanic
            <select data-testid="wi-mechanic" value={mechanic} onChange={(e) => setMechanic(e.target.value as 'additive' | 'multiplicative')} className="mt-1 block rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong">
              <option value="multiplicative">multiplicative (%)</option>
              <option value="additive">additive (absolute)</option>
            </select>
          </label>
          <label className="text-xs text-content-muted">
            {mechanic === 'multiplicative' ? 'Delta %' : 'Delta (absolute)'}
            <input data-testid="wi-delta" value={delta} onChange={(e) => setDelta(e.target.value)} className="mt-1 block w-24 rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong" />
          </label>
          <button type="button" data-testid="wi-run" onClick={run} disabled={busy} className="rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Simulating…' : 'Simulate'}
          </button>
        </div>

        {result && sc && (
          <>
            <SeriesChart values={sc.values} testId="wi-chart" />
            <div className="grid grid-cols-2 gap-3" data-testid="wi-result">
              <div className="rounded-lg border border-border bg-surface-1 p-4">
                <p className="text-xs text-content-muted">Aggregate lift</p>
                <p className="mt-1 text-lg font-semibold text-content-strong">{sc.aggregateLift.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-1 p-4">
                <p className="text-xs text-content-muted">Lift %</p>
                <p className="mt-1 text-lg font-semibold text-content-strong" data-testid="wi-lift-pct">{sc.aggregateLiftPct.toFixed(1)}%</p>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-content-muted">
                  <tr><th className="px-4 py-2">#</th><th className="px-4 py-2">Baseline</th><th className="px-4 py-2">Scenario</th></tr>
                </thead>
                <tbody>
                  {result.baseline.map((b, i) => (
                    <tr key={i} className="border-t border-border bg-surface-1">
                      <td className="px-4 py-2 text-content-muted">{i + 1}</td>
                      <td className="px-4 py-2 text-content-strong">{b.toFixed(2)}</td>
                      <td className="px-4 py-2 text-content-strong">{sc.values[i]?.toFixed(2) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
