'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, EyeOff, RefreshCw } from 'lucide-react';

import {
  ApiError,
  getAccessToken,
  listInsights,
  generateInsightsBatch,
  generateInsight,
  dismissInsight,
  type Insight,
} from '../../lib/api-client';
import { AppShell } from '../../components/app-shell';
import { RequirePermission } from '../../components/auth/require-permission';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Select,
  EmptyState,
  Skeleton,
} from '../../components/ui';

type SortKey = 'confidence' | 'recency';

const MIN_CONFIDENCE_OPTIONS = [
  { value: '0', label: 'Any confidence' },
  { value: '0.5', label: '≥ 50%' },
  { value: '0.75', label: '≥ 75%' },
] as const;

export default function InsightsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Insight[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Per-card regeneration spinner — keyed by kpiId.
  const [regenKpiId, setRegenKpiId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('recency');
  const [minConfidence, setMinConfidence] = useState(0);

  const load = useCallback(() => {
    listInsights()
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
      await generateInsightsBatch({});
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (kpiId: string) => {
    setError(null);
    setRegenKpiId(kpiId);
    try {
      await generateInsight(kpiId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Regeneration failed');
    } finally {
      setRegenKpiId(null);
    }
  };

  const dismiss = async (id: string) => {
    setError(null);
    // Optimistically remove the row; refetch to reconcile with the server.
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    try {
      await dismissInsight(id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Dismiss failed');
    } finally {
      load();
    }
  };

  // Client-side sort + min-confidence filter over the loaded list.
  const visibleRows = useMemo(() => {
    const base = (rows ?? []).filter((r) => r.confidence >= minConfidence);
    const sorted = [...base].sort((a, b) => {
      if (sort === 'confidence') return b.confidence - a.confidence;
      return new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime();
    });
    return sorted;
  }, [rows, sort, minConfidence]);

  const loading = rows === null && !error;

  return (
    <RequirePermission permission="INSIGHTS_VIEW">
      <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Intelligence"
          title="AI Insights"
          subtitle="Narratives about your KPIs' recent trends, generated and cited from your data."
          actions={
            <Button
              type="button"
              data-testid="insights-generate"
              onClick={generate}
              isLoading={busy}
              leftIcon={!busy ? <Sparkles aria-hidden className="h-4 w-4" /> : undefined}
            >
              {busy ? 'Generating' : 'Generate insights'}
            </Button>
          }
        />

        {error && (
          <div
            role="alert"
            data-testid="insights-error"
            className="rounded-lg border border-status-critical bg-status-critical-bg px-4 py-3 text-sm font-medium text-status-critical"
          >
            {error}
          </div>
        )}

        {!loading && (rows?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3" data-testid="insights-controls">
            <label className="flex items-center gap-2 text-xs font-medium text-content-muted">
              Sort
              <Select
                data-testid="insights-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-8 w-40"
              >
                <option value="recency">Most recent</option>
                <option value="confidence">Highest confidence</option>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-content-muted">
              Confidence
              <Select
                data-testid="insights-min-confidence"
                value={String(minConfidence)}
                onChange={(e) => setMinConfidence(Number(e.target.value))}
                className="h-8 w-40"
              >
                {MIN_CONFIDENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        )}

        {loading && (
          <div className="space-y-3" data-testid="insights-loading">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="space-y-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-40" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && (
          <div className="space-y-3" data-testid="insights-list">
            {visibleRows.map((r) => (
              <Card key={r.id} data-testid={`insight-row-${r.id}`} className="kn-card-hover">
                <CardContent className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/kpis/${r.kpiId}`}
                      className="text-xs font-medium text-accent-primary hover:underline"
                    >
                      KPI {r.kpiId.slice(0, 8)}…
                    </Link>
                    <div className="flex items-center gap-1">
                      <PermissionGuard permission="INSIGHTS_VIEW">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`insight-regenerate-${r.id}`}
                          onClick={() => regenerate(r.kpiId)}
                          isLoading={regenKpiId === r.kpiId}
                          leftIcon={
                            regenKpiId === r.kpiId ? undefined : (
                              <RefreshCw aria-hidden className="h-4 w-4" />
                            )
                          }
                        >
                          {regenKpiId === r.kpiId ? 'Regenerating' : 'Regenerate'}
                        </Button>
                      </PermissionGuard>
                      <PermissionGuard permission="INSIGHTS_VIEW">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`insight-dismiss-${r.id}`}
                          onClick={() => dismiss(r.id)}
                          leftIcon={<EyeOff aria-hidden className="h-4 w-4" />}
                        >
                          Dismiss
                        </Button>
                      </PermissionGuard>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-content-strong">{r.narrative}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-content-muted">
                    <Badge tone="info">{r.model}</Badge>
                    <Badge
                      data-testid={`insight-confidence-${r.id}`}
                      tone={
                        r.confidence >= 0.75 ? 'success' : r.confidence >= 0.5 ? 'info' : 'warning'
                      }
                    >
                      <span className="tabular-nums">{Math.round(r.confidence * 100)}%</span>
                      &nbsp;confident
                    </Badge>
                    <span className="tabular-nums">
                      {(r.promptTokens + r.completionTokens).toLocaleString()} tokens
                    </span>
                    <span aria-hidden>·</span>
                    <span className="tabular-nums">
                      {new Date(r.generatedAt).toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {rows && rows.length > 0 && visibleRows.length === 0 && (
              <div data-testid="insights-filtered-empty">
                <Card>
                  <EmptyState
                    icon={Sparkles}
                    title="No insights match the filter"
                    description="Lower the minimum confidence to see more."
                  />
                </Card>
              </div>
            )}

            {rows && rows.length === 0 && (
              <div data-testid="insights-empty">
                <Card>
                  <EmptyState
                    icon={Sparkles}
                    title="No insights yet"
                    description={'Click "Generate insights" to summarize your most-changed KPIs.'}
                    action={
                      <Button type="button" onClick={generate} isLoading={busy}>
                        {busy ? 'Generating' : 'Generate insights'}
                      </Button>
                    }
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
