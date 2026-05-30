'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { SeriesChart } from '../../../../components/series-chart';
import { ApiError, api, getAccessToken } from '../../../../lib/api-client';

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

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-4">
      <p className="text-xs text-content-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-content-strong">{value}</p>
    </div>
  );
}

export default function ForecastPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [horizon, setHorizon] = useState('14');
  const [model, setModel] = useState('naive');
  const [fc, setFc] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) router.replace('/login');
  }, [router]);

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api<Forecast>(`/kpis/${id}/forecasts`, {
        method: 'POST',
        body: JSON.stringify({ horizon: Number(horizon), model }),
      });
      setFc(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Forecast failed');
    } finally {
      setBusy(false);
    }
  };

  const yhat = fc?.predictions.map((p) => p.yhat) ?? [];
  const band = fc
    ? { lower: fc.predictions.map((p) => p.yhat_lower_95), upper: fc.predictions.map((p) => p.yhat_upper_95) }
    : undefined;

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href={`/kpis/${id}`} className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">Forecast</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Forecast</h1>
        {error && <p className="text-sm text-status-critical" data-testid="fc-error">{error}</p>}

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-1 p-4">
          <label className="text-xs text-content-muted">
            Model
            <select data-testid="fc-model" value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 block rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong">
              {['naive', 'prophet', 'arima'].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs text-content-muted">
            Horizon (days)
            <input data-testid="fc-horizon" value={horizon} onChange={(e) => setHorizon(e.target.value)} className="mt-1 block w-24 rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong" />
          </label>
          <button type="button" data-testid="fc-run" onClick={run} disabled={busy} className="rounded bg-accent-primary px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? 'Forecasting…' : 'Generate forecast'}
          </button>
        </div>

        {fc && (
          <>
            <SeriesChart values={yhat} band={band} testId="fc-chart" />
            <div className="grid grid-cols-3 gap-3" data-testid="fc-metrics">
              <Tile label="Model" value={fc.model} />
              <Tile label="RMSE" value={fc.fitMetrics?.rmse?.toFixed(2) ?? '—'} />
              <Tile label="MAPE" value={fc.fitMetrics?.mape !== undefined ? `${fc.fitMetrics.mape.toFixed(1)}%` : '—'} />
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-content-muted">
                  <tr><th className="px-4 py-2">ds</th><th className="px-4 py-2">yhat</th><th className="px-4 py-2">80% band</th><th className="px-4 py-2">95% band</th></tr>
                </thead>
                <tbody>
                  {fc.predictions.map((p) => (
                    <tr key={p.ds} className="border-t border-border bg-surface-1">
                      <td className="px-4 py-2 text-content-strong">{p.ds}</td>
                      <td className="px-4 py-2 text-content-strong">{p.yhat.toFixed(2)}</td>
                      <td className="px-4 py-2 text-content-muted">{p.yhat_lower_80.toFixed(1)} – {p.yhat_upper_80.toFixed(1)}</td>
                      <td className="px-4 py-2 text-content-muted">{p.yhat_lower_95.toFixed(1)} – {p.yhat_upper_95.toFixed(1)}</td>
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
