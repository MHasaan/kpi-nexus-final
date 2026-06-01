'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';

import { ApiError, getAccessToken, meRequest } from '../../lib/api-client';
import { type Objective, createObjective, listObjectives } from '../../lib/collab-client';
import { cn } from '../../lib/cn';
import { AppShell } from '../../components/app-shell';
import { PermissionGuard } from '../../components/auth/permission-guard';
import {
  PageHeader,
  Card,
  CardContent,
  Input,
  Button,
  Badge,
  EmptyState,
  Skeleton,
  type BadgeTone,
} from '../../components/ui';

const STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  ACTIVE: 'info',
  AT_RISK: 'warning',
  ACHIEVED: 'success',
  MISSED: 'error',
  ARCHIVED: 'neutral',
};

function barColor(status: string): string {
  if (status === 'AT_RISK') return 'bg-status-warning';
  if (status === 'ACHIEVED') return 'bg-status-success';
  if (status === 'MISSED') return 'bg-status-critical';
  return 'bg-accent-primary';
}

export default function OkrsPage() {
  const router = useRouter();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setObjectives(await listObjectives());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load objectives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    meRequest().then((r) => setUserId(r.user.id)).catch(() => undefined);
    void load();
  }, [load, router]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      let owner = userId;
      if (!owner) {
        owner = (await meRequest()).user.id;
        setUserId(owner);
      }
      const year = '2026';
      const obj = await createObjective({
        name: name.trim(),
        ownerUserId: owner,
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
        status: 'ACTIVE',
      });
      setName('');
      router.push(`/okrs/${obj.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create objective');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AppShell title="Objectives" crumbs={[{ label: 'OKRs' }]}>
      <PageHeader
        title="Objectives"
        subtitle="Goals that frame your KPIs — progress rolls up from key results"
      />

      <PermissionGuard permission="KPI_CREATE">
        <Card className="mb-6">
          <CardContent className="flex flex-wrap items-center gap-2">
            <Input
              data-testid="objective-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New objective name"
              className="min-w-[220px] flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
            <Button data-testid="create-objective" onClick={create} isLoading={creating} disabled={creating}>
              {creating ? 'Creating…' : 'Create objective'}
            </Button>
          </CardContent>
        </Card>
      </PermissionGuard>

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="okrs-error"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : objectives.length === 0 ? (
        <EmptyState
          icon={Flag}
          data-testid="okrs-empty"
          title="No objectives yet"
          description="Create your first objective to start framing KPIs into measurable goals."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="objective-grid">
          {objectives.map((o) => {
            const pct = Math.round(o.progress * 100);
            return (
              <Link
                key={o.id}
                href={`/okrs/${o.id}`}
                data-testid={`objective-${o.id}`}
                className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className={cn('kn-card-hover', 'h-full')}>
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex items-start gap-2">
                      <Flag className="mt-0.5 h-4 w-4 shrink-0 text-content-muted" aria-hidden />
                      <h2 className="flex-1 text-sm font-semibold leading-snug text-content-strong">{o.name}</h2>
                      <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-xs text-content-muted">Progress</span>
                        <span className="text-lg font-bold tabular-nums text-content-strong">{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                        <div className={`h-full rounded-full ${barColor(o.status)}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
