'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, api, getAccessToken } from '../../lib/api-client';

interface Insight {
  id: string;
  kpiId: string;
  narrative: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  generatedAt: string;
}

export default function InsightsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Insight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Insight[]>('/insights')
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    load();
  }, [load, router]);

  const generate = async () => {
    setError(null);
    setBusy(true);
    try {
      await api('/insights/generate-batch', { method: 'POST', body: JSON.stringify({}) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">Insights</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-content-strong">AI Insights</h1>
            <p className="mt-1 text-sm text-content-muted">Narratives about your KPIs&apos; recent trends.</p>
          </div>
          <button
            type="button"
            data-testid="insights-generate"
            onClick={generate}
            disabled={busy}
            className="rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate insights'}
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-status-critical" data-testid="insights-error">{error}</p>}

        <div className="mt-6 space-y-3" data-testid="insights-list">
          {(rows ?? []).map((r) => (
            <article key={r.id} data-testid={`insight-row-${r.id}`} className="rounded-lg border border-border bg-surface-1 p-5">
              <Link href={`/kpis/${r.kpiId}`} className="text-xs font-medium text-accent-primary hover:underline">
                KPI {r.kpiId.slice(0, 8)}…
              </Link>
              <p className="mt-2 text-sm text-content-strong">{r.narrative}</p>
              <p className="mt-3 text-xs text-content-muted">
                {r.model} · {r.promptTokens + r.completionTokens} tokens · {new Date(r.generatedAt).toLocaleString()}
              </p>
            </article>
          ))}
          {rows && rows.length === 0 && (
            <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="insights-empty">
              No insights yet. Click &quot;Generate insights&quot; to summarize your most-changed KPIs.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
