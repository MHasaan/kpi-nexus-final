'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, api, getAccessToken } from '../../lib/api-client';

interface SuggestedAction {
  action: string;
  rationale: string;
  priority: 'P1' | 'P2' | 'P3';
}

interface Recommendation {
  id: string;
  kpiId: string;
  status: 'PENDING' | 'ACTIONED' | 'DISMISSED';
  confidence: number;
  createdAt: string;
  content: {
    summary?: string;
    rootCauseHypotheses?: string[];
    suggestedActions?: SuggestedAction[];
  };
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-status-warning/20 text-status-warning',
  ACTIONED: 'bg-status-positive/20 text-status-positive',
  DISMISSED: 'bg-surface-2 text-content-muted',
};

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'text-status-critical',
  P2: 'text-status-warning',
  P3: 'text-accent-primary',
};

export default function RecommendationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Recommendation[]>('/recommendations')
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

  const setStatus = async (id: string, status: 'ACTIONED' | 'DISMISSED') => {
    setError(null);
    try {
      await api(`/recommendations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    }
  };

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">
            KPI Nexus
          </Link>
          <span className="text-sm text-content-muted">Recommendations</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-2xl font-semibold text-content-strong">AI Recommendations</h1>
        <p className="mt-1 text-sm text-content-muted">
          Suggested actions generated from alerts and confirmed anomalies.
        </p>
        {error && <p className="mt-4 text-sm text-status-critical" data-testid="recs-error">{error}</p>}

        <div className="mt-6 space-y-4" data-testid="recs-list">
          {(rows ?? []).map((r) => (
            <article
              key={r.id}
              data-testid={`rec-row-${r.id}`}
              className="rounded-lg border border-border bg-surface-1 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-content-strong">{r.content.summary ?? '(no summary)'}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? ''}`}
                  data-testid={`rec-status-${r.id}`}
                >
                  {r.status}
                </span>
              </div>

              {(r.content.rootCauseHypotheses?.length ?? 0) > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-content-muted">
                  {r.content.rootCauseHypotheses!.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              )}

              {(r.content.suggestedActions?.length ?? 0) > 0 && (
                <div className="mt-3 space-y-2">
                  {r.content.suggestedActions!.map((a, i) => (
                    <div key={i} className="rounded border border-border bg-surface-bg p-3 text-xs">
                      <span className={`font-semibold ${PRIORITY_COLOR[a.priority] ?? 'text-content-strong'}`}>
                        {a.priority}
                      </span>{' '}
                      <span className="text-content-strong">{a.action}</span>
                      {a.rationale && <p className="mt-1 text-content-muted">{a.rationale}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-content-muted">
                  Confidence {Math.round(r.confidence * 100)}%
                </span>
                {r.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      data-testid={`rec-action-${r.id}`}
                      onClick={() => setStatus(r.id, 'ACTIONED')}
                      className="rounded bg-status-positive px-3 py-1 text-xs font-medium text-white hover:opacity-90"
                    >
                      Actioned
                    </button>
                    <button
                      type="button"
                      data-testid={`rec-dismiss-${r.id}`}
                      onClick={() => setStatus(r.id, 'DISMISSED')}
                      className="rounded border border-border px-3 py-1 text-xs font-medium text-content-muted hover:bg-surface-2"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}

          {rows && rows.length === 0 && (
            <p
              className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted"
              data-testid="recs-empty"
            >
              No recommendations yet. They appear when alerts fire or anomalies are confirmed.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
