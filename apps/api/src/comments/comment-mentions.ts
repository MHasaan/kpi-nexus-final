/**
 * Pure mention helpers for CommentsModule. `extractMentionHandles` pulls
 * `@handle` tokens out of a comment body for display/denormalization;
 * `dedupeMentionTargets` cleans a client-resolved userId list (dedupe + strip
 * the author so nobody mentions themselves).
 */

// A handle must be preceded by start-of-string or whitespace so emails like
// x@y.com don't match. Handles are [a-zA-Z0-9_-]+.
const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9_-]+)/g;

export function extractMentionHandles(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of body.matchAll(MENTION_RE)) {
    const handle = match[1];
    if (handle && !seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}

export function dedupeMentionTargets(userIds: readonly string[], authorId: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of userIds) {
    if (id === authorId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
