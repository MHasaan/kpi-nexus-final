'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';

import { ApiError, type UserSummary, listUsers } from '../lib/api-client';
import {
  type Comment,
  type CommentEntityType,
  createComment,
  listComments,
} from '../lib/collab-client';
import { Button, Avatar, Textarea, EmptyState, Skeleton } from './ui';

/**
 * Slide-out comments panel for any entity (KPI, dashboard, alert, task,
 * objective). Resolves `@handle` tokens in the body to org-member userIds and
 * sends them as `mentionedUserIds`, which the api turns into Mention rows.
 */
export function CommentsDrawer({
  entityType,
  entityId,
}: {
  entityType: CommentEntityType;
  entityId: string;
}) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, us] = await Promise.all([listComments(entityType, entityId), listUsers().catch(() => [])]);
      setComments(cs);
      setUsers(us);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Resolve @handle → userId by matching email local-part or fullName slug.
  const resolveMentions = (text: string): string[] => {
    const handles = [...text.matchAll(/(?:^|\s)@([a-zA-Z0-9_.-]+)/g)].map((m) => m[1]?.toLowerCase());
    const ids = new Set<string>();
    for (const h of handles) {
      if (!h) continue;
      const match = users.find(
        (u) => u.email.split('@')[0]?.toLowerCase() === h || u.fullName.toLowerCase().replace(/\s+/g, '') === h,
      );
      if (match) ids.add(match.id);
    }
    return [...ids];
  };

  const submit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await createComment({ entityType, entityId, body: body.trim(), mentionedUserIds: resolveMentions(body) });
      setBody('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post comment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="comments-trigger"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-bg px-3 py-1.5 text-sm text-content-muted transition-colors hover:bg-surface-hover hover:text-accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MessageSquare className="h-4 w-4" aria-hidden />
        Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" aria-hidden onClick={() => setOpen(false)} />
          <div
            data-testid="comments-drawer"
            role="dialog"
            aria-label="Comments"
            className="fixed bottom-0 right-0 top-0 z-50 flex w-[380px] max-w-full flex-col border-l border-border bg-surface-bg shadow-lg"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold text-content-strong">Comments</h2>
              <button
                type="button"
                aria-label="Close"
                data-testid="comments-close"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-content-muted transition-colors hover:bg-surface-hover hover:text-content-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <p
                  role="alert"
                  className="mb-3 rounded-lg border border-status-critical-bg bg-status-critical-bg px-3 py-2 text-sm text-status-critical"
                >
                  {error}
                </p>
              )}

              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className="mt-2 h-3 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <EmptyState
                  title="No comments yet"
                  description="Be the first to start the conversation."
                  className="px-4 py-10"
                />
              ) : (
                <div className="space-y-4" data-testid="comments-list">
                  {comments.map((c) => {
                    const author = users.find((u) => u.id === c.authorId)?.fullName ?? 'Unknown user';
                    return (
                      <div key={c.id} data-testid={`comment-${c.id}`} className="flex items-start gap-3">
                        <Avatar name={author} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-content-strong">{author}</p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm text-content-strong">{c.body}</p>
                          <p className="mt-1 text-xs tabular-nums text-content-muted">{new Date(c.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border px-5 py-4">
              <Textarea
                data-testid="comment-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add a comment… use @name to mention"
                rows={3}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-content-muted">@ mention to notify · markdown ok</span>
                <Button data-testid="comment-submit" onClick={submit} isLoading={submitting} disabled={submitting}>
                  Post comment
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
