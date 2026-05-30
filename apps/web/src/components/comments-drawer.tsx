'use client';

import { useCallback, useEffect, useState } from 'react';

import { ApiError, type UserSummary, listUsers } from '../lib/api-client';
import {
  type Comment,
  type CommentEntityType,
  createComment,
  listComments,
} from '../lib/collab-client';

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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cs, us] = await Promise.all([listComments(entityType, entityId), listUsers().catch(() => [])]);
      setComments(cs);
      setUsers(us);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load comments');
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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
    try {
      await createComment({ entityType, entityId, body: body.trim(), mentionedUserIds: resolveMentions(body) });
      setBody('');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post comment');
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="comments-trigger"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-border bg-surface-1 px-3 py-1 text-sm text-content-muted hover:text-accent-primary"
      >
        💬 Comments{comments.length > 0 ? ` (${comments.length})` : ''}
      </button>

      {open && (
        <div
          data-testid="comments-drawer"
          className="fixed right-0 top-0 z-40 flex h-full w-[380px] flex-col border-l border-border bg-surface-bg shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-content-strong">Comments</h2>
            <button type="button" aria-label="Close" data-testid="comments-close" onClick={() => setOpen(false)} className="text-content-muted hover:text-content-strong">
              ×
            </button>
          </div>

          {error && <p className="px-4 py-2 text-xs text-status-critical">{error}</p>}

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="comments-list">
            {comments.map((c) => (
              <div key={c.id} data-testid={`comment-${c.id}`} className="rounded-lg border border-border bg-surface-1 p-3 text-sm">
                <p className="whitespace-pre-wrap text-content-strong">{c.body}</p>
                <p className="mt-1 text-[10px] text-content-muted">{new Date(c.createdAt).toLocaleString()}</p>
              </div>
            ))}
            {comments.length === 0 && <p className="text-sm text-content-muted">No comments yet.</p>}
          </div>

          <div className="border-t border-border p-3">
            <textarea
              data-testid="comment-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a comment… use @name to mention"
              rows={3}
              className="w-full rounded border border-border bg-surface-1 px-2 py-1.5 text-sm text-content-strong"
            />
            <button type="button" data-testid="comment-submit" onClick={submit} className="mt-2 w-full rounded bg-accent-primary px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
              Post comment
            </button>
          </div>
        </div>
      )}
    </>
  );
}
