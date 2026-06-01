'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import {
  type KeyResult,
  type Objective,
  createKeyResult,
  getObjective,
  listKeyResults,
  syncObjectiveFromKpis,
  updateKeyResult,
} from '../../../lib/collab-client';
import { AppShell } from '../../../components/app-shell';
import { CommentsDrawer } from '../../../components/comments-drawer';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Label,
  Button,
  EmptyState,
  Skeleton,
} from '../../../components/ui';

export default function ObjectiveDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [objective, setObjective] = useState<Objective | null>(null);
  const [krs, setKrs] = useState<KeyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [krName, setKrName] = useState('');
  const [krBaseline, setKrBaseline] = useState('');
  const [krTarget, setKrTarget] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [obj, krList] = await Promise.all([getObjective(id), listKeyResults(id)]);
      setObjective(obj);
      setKrs(krList);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load objective');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const addKr = async () => {
    if (!krName.trim()) return;
    try {
      await createKeyResult(id, {
        name: krName.trim(),
        baselineValue: Number(krBaseline) || 0,
        targetValue: Number(krTarget) || 0,
      });
      setKrName('');
      setKrBaseline('');
      setKrTarget('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add key result');
    }
  };

  const updateCurrent = async (krId: string, value: string) => {
    try {
      await updateKeyResult(id, krId, { currentValue: Number(value) || 0 });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update key result');
    }
  };

  const sync = async () => {
    try {
      await syncObjectiveFromKpis(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sync from KPIs');
    }
  };

  const overall = objective ? Math.round(objective.progress * 100) : 0;

  return (
    <AppShell
      title={objective?.name ?? 'Objective'}
      crumbs={[{ label: 'OKRs', href: '/okrs' }, { label: objective?.name ?? 'Objective' }]}
    >
      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="okr-error"
        >
          {error}
        </p>
      )}

      {loading && !objective ? (
        <div>
          <Skeleton className="mb-6 h-8 w-64" />
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : !objective ? (
        <EmptyState title="Objective not found" description="This objective may have been removed." />
      ) : (
        <>
          <PageHeader
            title={<span data-testid="objective-heading">{objective.name}</span>}
            subtitle="Progress rolls up from your key results"
            actions={
              <CommentsDrawer entityType="objective" entityId={objective.id} />
            }
          />

          <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
            <Card data-testid="kr-list">
              <CardHeader className="flex items-center justify-between gap-2">
                <CardTitle>Key results</CardTitle>
                <Button variant="secondary" size="sm" data-testid="sync-kpis" onClick={sync} leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}>
                  Sync from linked KPIs
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {krs.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-content-muted" data-testid="kr-empty">
                    No key results yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border-divider">
                    {krs.map((kr) => {
                      const pct = Math.round(kr.progress * 100);
                      return (
                        <div key={kr.id} data-testid={`kr-${kr.id}`} className="px-4 py-4">
                          <div className="mb-2 flex items-center gap-3">
                            <span className="flex-1 text-sm font-medium text-content-strong">{kr.name}</span>
                            <span className="font-mono text-xs text-content-muted">
                              {kr.baselineValue ?? 0} → {kr.targetValue}
                            </span>
                            <span className="w-12 text-right text-sm font-bold tabular-nums text-content-strong">
                              {pct}% <span data-testid="kr-progress" />
                            </span>
                          </div>
                          <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-accent-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex items-center gap-2 text-sm text-content-muted">
                            <span>Current</span>
                            <Input
                              data-testid={`kr-current-${kr.id}`}
                              defaultValue={kr.currentValue ?? ''}
                              onBlur={(e) => updateCurrent(kr.id, e.target.value)}
                              className="h-8 w-28"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="bg-gradient-brand-soft">
                <CardContent className="text-center">
                  <div className="kn-eyebrow mb-1">Overall progress</div>
                  <div className="text-4xl font-bold tabular-nums text-content-strong" data-testid="objective-progress">
                    {overall}%
                  </div>
                  <div className="mx-auto mt-3 h-2 max-w-[220px] overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent-primary" style={{ width: `${overall}%` }} />
                  </div>
                  <p className="mt-3 text-xs text-content-muted">weighted across {krs.length} key results</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add key result</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="kr-name-input">Name</Label>
                    <Input id="kr-name-input" data-testid="kr-name" value={krName} onChange={(e) => setKrName(e.target.value)} placeholder="Key result name" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Label htmlFor="kr-baseline-input">Baseline</Label>
                      <Input id="kr-baseline-input" data-testid="kr-baseline" value={krBaseline} onChange={(e) => setKrBaseline(e.target.value)} placeholder="0" />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="kr-target-input">Target</Label>
                      <Input id="kr-target-input" data-testid="kr-target" value={krTarget} onChange={(e) => setKrTarget(e.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <Button data-testid="add-kr" onClick={addKr} className="w-full">
                    Add key result
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
