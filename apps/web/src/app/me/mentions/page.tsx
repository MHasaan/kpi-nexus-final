'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AtSign } from 'lucide-react';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import { type Mention, listMentions, markAllMentionsRead, markMentionRead } from '../../../lib/collab-client';
import { AppShell } from '../../../components/app-shell';
import { PageHeader, Card, CardContent, Badge, Button, EmptyState, Skeleton } from '../../../components/ui';
import { cn } from '../../../lib/cn';
import { currentLoginRedirect } from '../../../lib/auth-redirect';

export default function MentionsPage() {
  const router = useRouter();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMentions(await listMentions(unreadOnly));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load mentions');
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(currentLoginRedirect());
      return;
    }
    void load();
  }, [load, router]);

  const markRead = async (mentionId: string) => {
    try {
      await markMentionRead(mentionId);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not mark read');
    }
  };

  const markAll = async () => {
    try {
      await markAllMentionsRead();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not mark all read');
    }
  };

  const unreadCount = mentions.filter((m) => m.readAt == null).length;

  return (
    <AppShell title="Mentions" crumbs={[{ label: 'You' }, { label: 'Mentions' }]}>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Mentions
            {unreadCount > 0 && (
              <span data-testid="mentions-unread-badge">
                <Badge tone="info">{unreadCount} unread</Badge>
              </span>
            )}
          </span>
        }
        subtitle="Comments where you were @mentioned"
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-content-muted">
              <input
                type="checkbox"
                data-testid="unread-only"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
                className="rounded border-border text-accent-primary focus:ring-ring"
              />
              Unread only
            </label>
            <Button variant="secondary" size="sm" data-testid="mark-all-read" onClick={markAll}>
              Mark all read
            </Button>
          </>
        }
      />

      {error && (
        <p
          className="mb-4 rounded-lg border border-status-critical-bg bg-status-critical-bg px-4 py-3 text-sm text-status-critical"
          role="alert"
          data-testid="mentions-error"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-3 h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : mentions.length === 0 ? (
        <EmptyState
          icon={AtSign}
          data-testid="mentions-empty"
          title="No mentions"
          description="When a teammate @mentions you in a comment, it will show up here."
        />
      ) : (
        <div className="space-y-2" data-testid="mentions-list">
          {mentions.map((m) => (
            <Card
              key={m.id}
              data-testid={`mention-${m.id}`}
              className={cn(m.readAt == null && 'border-l-4 border-l-accent-primary bg-accent-bg/40')}
            >
              <CardContent>
                <p className={cn('text-sm text-content-strong', m.readAt == null && 'font-medium')}>
                  You were mentioned
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs tabular-nums text-content-muted">{new Date(m.createdAt).toLocaleString()}</span>
                  {m.readAt == null && (
                    <button
                      type="button"
                      data-testid={`mark-read-${m.id}`}
                      onClick={() => markRead(m.id)}
                      className="text-xs font-medium text-accent-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
