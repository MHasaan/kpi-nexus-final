'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb } from 'lucide-react';

import { ApiError, api, getAccessToken } from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import {
  PageHeader,
  Card,
  CardContent,
  CardFooter,
  Button,
  Badge,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from '../../components/ui';

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

// Status → Badge tone (icon/label keeps it readable; never colour-only).
const STATUS_TONE: Record<Recommendation['status'], BadgeTone> = {
  PENDING: 'warning',
  ACTIONED: 'success',
  DISMISSED: 'neutral',
};

const STATUS_LABEL: Record<Recommendation['status'], string> = {
  PENDING: 'Pending',
  ACTIONED: 'Actioned',
  DISMISSED: 'Dismissed',
};

// Priority pill tone — P1 most urgent.
const PRIORITY_TONE: Record<SuggestedAction['priority'], BadgeTone> = {
  P1: 'error',
  P2: 'warning',
  P3: 'info',
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

  const loading = rows === null && !error;

  return (
    <RequirePermission permission="INSIGHTS_VIEW">
      <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Intelligence"
          title="AI Recommendations"
          subtitle="Suggested actions generated from alerts and confirmed anomalies."
        />

        {error && (
          <div
            role="alert"
            data-testid="recs-error"
            className="rounded-lg border border-status-critical bg-status-critical-bg px-4 py-3 text-sm font-medium text-status-critical"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-4" data-testid="recs-loading">
            {[0, 1].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && (
          <div className="space-y-4" data-testid="recs-list">
            {(rows ?? []).map((r) => (
              <Card key={r.id} data-testid={`rec-row-${r.id}`}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-medium text-content-strong">
                      {r.content.summary ?? '(no summary)'}
                    </p>
                    <Badge
                      tone={STATUS_TONE[r.status]}
                      className="shrink-0"
                      data-testid={`rec-status-${r.id}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>

                  {(r.content.rootCauseHypotheses?.length ?? 0) > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-xs text-content-muted">
                      {r.content.rootCauseHypotheses!.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  )}

                  {(r.content.suggestedActions?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      {r.content.suggestedActions!.map((a, i) => (
                        <div
                          key={i}
                          className="rounded-lg border border-border bg-surface-1 p-3 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Badge tone={PRIORITY_TONE[a.priority]}>{a.priority}</Badge>
                            <span className="font-medium text-content-strong">{a.action}</span>
                          </div>
                          {a.rationale && <p className="mt-1 text-content-muted">{a.rationale}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-content-muted">
                      Confidence {Math.round(r.confidence * 100)}%
                    </span>
                    {r.kpiId && (
                      <Link href={`/kpis/${r.kpiId}`} data-testid={`rec-kpi-${r.id}`}>
                        <Badge tone="info" className="transition-colors hover:brightness-95">
                          KPI {r.kpiId.slice(0, 8)}…
                        </Badge>
                      </Link>
                    )}
                  </div>
                  {r.status === 'PENDING' && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        data-testid={`rec-action-${r.id}`}
                        onClick={() => setStatus(r.id, 'ACTIONED')}
                      >
                        Actioned
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        data-testid={`rec-dismiss-${r.id}`}
                        onClick={() => setStatus(r.id, 'DISMISSED')}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </CardFooter>
              </Card>
            ))}

            {rows && rows.length === 0 && (
              <div data-testid="recs-empty">
                <Card>
                  <EmptyState
                    icon={Lightbulb}
                    title="No recommendations yet"
                    description="They appear when alerts fire or anomalies are confirmed."
                  />
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
      </AppShell>
    </RequirePermission>
  );
}
