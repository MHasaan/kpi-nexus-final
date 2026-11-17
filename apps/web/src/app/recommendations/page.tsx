'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, AlertTriangle } from 'lucide-react';

import {
  ApiError,
  generateRecommendation,
  getAccessToken,
  listRecommendations,
  setRecommendationStatus,
  type Recommendation,
  type RecommendationSuggestedAction,
} from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import { usePermissions } from '../../lib/use-permissions';
import {
  PageHeader,
  Card,
  CardContent,
  CardFooter,
  Button,
  Badge,
  Select,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from '../../components/ui';
import { useKpiNames } from '../../lib/use-kpi-names';
import { useToast } from '../../lib/use-toast';
import { currentLoginRedirect } from '../../lib/auth-redirect';

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
const PRIORITY_TONE: Record<RecommendationSuggestedAction['priority'], BadgeTone> = {
  P1: 'error',
  P2: 'warning',
  P3: 'info',
};

const PRIORITY_RANK: Record<RecommendationSuggestedAction['priority'], number> = {
  P1: 1,
  P2: 2,
  P3: 3,
};

/** A recommendation's effective priority = the most urgent of its actions (P1 < P2 < P3). */
function topPriorityRank(r: Recommendation): number {
  const actions = r.content.suggestedActions ?? [];
  if (actions.length === 0) return 99; // no actions sort last
  return Math.min(...actions.map((a) => PRIORITY_RANK[a.priority]));
}

type SortKey = 'priority' | 'recency';

export default function RecommendationsPage() {
  const canAct = usePermissions().has('KPI_EDIT');
  const { nameOf, kpis } = useKpiNames();
  const toast = useToast();
  const [askKpiId, setAskKpiId] = useState('');
  const [asking, setAsking] = useState(false);
  const router = useRouter();
  const [rows, setRows] = useState<Recommendation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('priority');

  const load = useCallback(() => {
    listRecommendations()
      .then(setRows)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    load();
  }, [load, router]);

  // The page listed recommendations and had no way to ask for one (plan 7.7).
  const ask = async () => {
    if (!askKpiId) return;
    setAsking(true);
    setError(null);
    try {
      await generateRecommendation(askKpiId);
      toast.success('Recommendation ready', `For ${nameOf(askKpiId)}.`);
      setAskKpiId('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? `No recommendation was made: ${e.message}` : 'No recommendation was made. Try again.');
    } finally {
      setAsking(false);
    }
  };

  const setStatus = async (id: string, status: 'ACTIONED' | 'DISMISSED') => {
    setError(null);
    try {
      await setRecommendationStatus(id, status);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Update failed');
    }
  };

  // Client-side sort: priority (P1→P3) then confidence desc; or recency.
  const visibleRows = useMemo(() => {
    const base = [...(rows ?? [])];
    base.sort((a, b) => {
      if (sort === 'recency') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      const pr = topPriorityRank(a) - topPriorityRank(b);
      if (pr !== 0) return pr;
      return b.confidence - a.confidence;
    });
    return base;
  }, [rows, sort]);

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

        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-1 p-4" data-testid="recs-ask">
          <label className="grid gap-1 text-xs font-medium text-content-muted">
            Ask for a recommendation about
            <Select data-testid="recs-ask-kpi" value={askKpiId} onChange={(e) => setAskKpiId(e.target.value)} className="h-9 w-64" disabled={asking}>
              <option value="">Choose a KPI…</option>
              {kpis.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </label>
          <Button type="button" onClick={() => void ask()} disabled={!askKpiId || asking} isLoading={asking} data-testid="recs-ask-submit">
            {asking ? 'Thinking…' : 'Get a recommendation'}
          </Button>
          <p className="basis-full text-xs text-content-muted">It looks at the KPI’s recent values and uses your organisation’s AI budget.</p>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="recs-error"
            className="rounded-lg border border-status-critical bg-status-critical-bg px-4 py-3 text-sm font-medium text-status-critical"
          >
            {error}
          </div>
        )}

        {!loading && (rows?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3" data-testid="recs-controls">
            <label className="flex items-center gap-2 text-xs font-medium text-content-muted">
              Sort
              <Select
                data-testid="recs-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-8 w-44"
              >
                <option value="priority">Priority, then confidence</option>
                <option value="recency">Most recent</option>
              </Select>
            </label>
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
            {visibleRows.map((r) => (
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
                          {nameOf(r.kpiId)}
                        </Badge>
                      </Link>
                    )}
                    {r.alertId && (
                      <Link href={`/alerts/${r.alertId}`} data-testid={`rec-alert-${r.id}`}>
                        <Badge
                          tone="warning"
                          className="inline-flex items-center gap-1 transition-colors hover:brightness-95"
                        >
                          <AlertTriangle aria-hidden className="h-3 w-3" />
                          From alert
                        </Badge>
                      </Link>
                    )}
                  </div>
                  {/* Marking a recommendation is KPI_EDIT on the API; a reader is not shown buttons that would be refused (UI-013). */}
                  {r.status === 'PENDING' && canAct && (
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
