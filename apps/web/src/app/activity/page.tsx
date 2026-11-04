'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';

import { ApiError, getAccessToken } from '../../lib/api-client';
import { type ActivityItem, listActivity } from '../../lib/polish-client';
import { AppShell } from '../../components/app-shell';
import { PageHeader, Card, CardContent, Select, Avatar, Button, EmptyState, Skeleton } from '../../components/ui';
import { currentLoginRedirect } from '../../lib/auth-redirect';

export default function ActivityPage() {
  const router = useRouter();
  const [events, setEvents] = useState<ActivityItem[]>([]);
  const [entityType, setEntityType] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (reset = false) => {
    if (reset) setLoading(true);
    try {
      const res = await listActivity({ entityType: entityType || undefined, cursor: reset ? undefined : cursor ?? undefined });
      setEvents((prev) => (reset ? res.items : [...prev, ...res.items]));
      setCursor(res.nextCursor);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load activity');
    } finally {
      if (reset) setLoading(false);
    }
  }, [entityType, cursor]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load(true);
  }, [entityType]);

  return (
    <AppShell title="Activity" crumbs={[{ label: 'Activity' }]}>
      <PageHeader
        title="Activity"
        subtitle="An audit-backed timeline of everything happening across your org"
        actions={
          <Select
            data-testid="activity-entity-filter"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-40"
          >
            <option value="">All entities</option>
            <option value="KPI">KPI</option>
            <option value="OBJECTIVE">Objective</option>
            <option value="TASK">Task</option>
          </Select>
        }
      />

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="activity-error"
        >
          {error}
        </p>
      )}

      {loading ? (
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          icon={History}
          data-testid="activity-empty"
          title="No activity yet"
          description="As your team records values, creates tasks and fires alerts, it shows up here."
        />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border-divider" data-testid="activity-list">
                {events.map((ev) => (
                  <div key={ev.id} data-testid={`activity-${ev.id}`} className="flex items-center gap-3 px-4 py-3">
                    <Avatar name={ev.userName ?? 'Someone'} size="sm" />
                    <div className="min-w-0 flex-1 text-sm text-content">
                      <span className="font-semibold text-content-strong">{ev.userName ?? 'Someone'}</span>{' '}
                      <span className="text-content-muted">{ev.action}</span>{' '}
                      {ev.entityType && (
                        <span className="font-medium text-accent-primary">{ev.entityType}</span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-content-muted">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {cursor && (
            <div className="mt-4 text-center">
              <Button variant="secondary" data-testid="activity-load-more" onClick={() => load(false)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
