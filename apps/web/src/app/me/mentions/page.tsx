'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ApiError, getAccessToken } from '../../../lib/api-client';
import {
  type Mention,
  listMentions,
  markAllMentionsRead,
  markMentionRead,
} from '../../../lib/collab-client';

export default function MentionsPage() {
  const router = useRouter();
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMentions(await listMentions(unreadOnly));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load mentions');
    }
  }, [unreadOnly]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void load();
  }, [load, router]);

  const markRead = async (id: string) => {
    try {
      await markMentionRead(id);
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

  const unreadCount = mentions.filter((m) => m.readAt === null).length;

  return (
    <main className="min-h-screen bg-surface-bg">
      <header className="border-b border-border bg-surface-1">
        <div className="mx-auto flex max-w-3xl items-center gap-6 px-6 py-4">
          <Link href="/kpis" className="text-lg font-semibold text-content-strong hover:text-accent-primary">KPI Nexus</Link>
          <span className="text-sm text-content-muted">Mentions</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-content-strong">
            Mentions {unreadCount > 0 && <span data-testid="mentions-unread-badge" className="ml-2 rounded-full bg-accent-primary px-2 py-0.5 text-sm text-white">{unreadCount}</span>}
          </h1>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm text-content-muted">
              <input type="checkbox" data-testid="unread-only" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
              Unread only
            </label>
            <button type="button" data-testid="mark-all-read" onClick={markAll} className="text-sm text-accent-primary hover:underline">
              Mark all read
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-sm text-status-critical">{error}</p>}

        <div className="mt-6 space-y-2" data-testid="mentions-list">
          {mentions.map((m) => (
            <div
              key={m.id}
              data-testid={`mention-${m.id}`}
              className={`flex items-center justify-between rounded-lg border border-border p-4 ${m.readAt ? 'bg-surface-1' : 'bg-surface-1 border-l-4 border-l-accent-primary'}`}
            >
              <div>
                <p className="text-sm text-content-strong">You were mentioned in a comment</p>
                <p className="text-xs text-content-muted">{new Date(m.createdAt).toLocaleString()}</p>
              </div>
              {!m.readAt && (
                <button type="button" data-testid={`mark-read-${m.id}`} onClick={() => void markRead(m.id)} className="text-xs text-accent-primary hover:underline">
                  Mark read
                </button>
              )}
            </div>
          ))}
          {mentions.length === 0 && <p className="rounded-lg border border-border bg-surface-1 p-8 text-center text-content-muted" data-testid="mentions-empty">No mentions.</p>}
        </div>
      </div>
    </main>
  );
}
