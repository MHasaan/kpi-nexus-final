'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { SeriesChart } from '../../../../components/series-chart';
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

  const load = useCallback(() => {
    api<DataPoint[]>(`/kpis/${id}/data?limit=365`)
      .then((rows) => setSeries([...rows].reverse().map((r) => r.value)))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load series'));
    api<Anomaly[]>(`/kpis/${id}/anomalies`).then(setSaved).catch(() => undefined);
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
      await api(`/kpis/${id}/anomalies/${anomalyId}/confirm`, { method: 'PATCH', body: JSON.stringify({}) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Confirm failed');
    }
  };

  const markers = (detected ?? []).map((a) => a.index);

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <Link href={`/kpis/${id}`} className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">Anomalies</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">Anomaly detection</h1>
        {error && <p className="text-sm text-status-critical" data-testid="anom-error">{error}</p>}

        <SeriesChart values={series} markers={markers} testId="anom-chart" />

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-1 p-4">
          <label className="text-xs text-content-muted">
            Method
            <select
              data-testid="anom-method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="mt-1 block rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong"
            >
              {['ensemble', 'zscore', 'ewma', 'isolation_forest'].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-content-muted">
            Threshold
            <input
              data-testid="anom-threshold"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-1 block w-20 rounded border border-border bg-surface-bg px-2 py-1 text-sm text-content-strong"
            />
          </label>
          <button type="button" data-testid="anom-detect" onClick={() => detect(false)} disabled={busy} className="rounded bg-surface-2 px-3 py-1.5 text-sm text-content-strong hover:bg-surface-2/80 disabled:opacity-50">
            {busy ? '…' : 'Detect'}
          </button>
          <button type="button" data-testid="anom-detect-persist" onClick={() => detect(true)} disabled={busy} className="rounded bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Detect & save
          </button>
        </div>

        {detected && (
          <div data-testid="anom-detected" className="rounded-lg border border-border bg-surface-1 p-4 text-sm text-content-strong">
            Detected <strong>{detected.length}</strong> anomal{detected.length === 1 ? 'y' : 'ies'} (live).
          </div>
        )}

        <section>
          <h2 className="text-sm font-semibold text-content-strong">Saved anomalies</h2>
          <div className="mt-2 space-y-2" data-testid="anom-saved">
            {saved.map((a) => (
              <div key={a.id} data-testid={`anom-row-${a.id}`} className="flex items-center justify-between rounded border border-border bg-surface-1 p-3 text-sm">
                <span className="text-content-strong">score {a.score.toFixed(2)} · {a.method}</span>
                {a.isConfirmed ? (
                  <span className="text-xs text-status-positive" data-testid={`anom-confirmed-${a.id}`}>Confirmed</span>
                ) : (
                  <button type="button" data-testid={`anom-confirm-${a.id}`} onClick={() => confirm(a.id)} className="rounded bg-status-warning px-3 py-1 text-xs font-medium text-white hover:opacity-90">
                    Confirm
                  </button>
                )}
              </div>
            ))}
            {saved.length === 0 && <p className="text-sm text-content-muted">None saved yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
