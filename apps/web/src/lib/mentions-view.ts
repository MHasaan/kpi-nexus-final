/** A mention as a sentence and a link: who wrote, on what, and where to go to read it. */

const PLACES: Record<string, { noun: string; href: (id: string) => string }> = {
  kpi: { noun: 'a KPI', href: (id) => `/kpis/${id}` },
  dashboard: { noun: 'a dashboard', href: (id) => `/dashboards/${id}` },
  alert: { noun: 'an alert', href: (id) => `/alerts/${id}` },
  objective: { noun: 'an objective', href: (id) => `/okrs/${id}` },
  // A task has no page of its own; the board opens it.
  task: { noun: 'a task', href: () => '/tasks' },
};

export interface MentionRow {
  authorName?: string | null;
  excerpt?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/** "Ada Admin mentioned you on a KPI" — with what is known, and no more. */
export function mentionSentence(mention: MentionRow): string {
  const who = mention.authorName ?? 'Someone';
  const place = mention.entityType ? PLACES[mention.entityType.toLowerCase()] : undefined;
  return place ? `${who} mentioned you on ${place.noun}` : `${who} mentioned you`;
}

/** Where the comment can be read, or null when the row does not say. */
export function mentionHref(mention: MentionRow): string | null {
  if (!mention.entityType || !mention.entityId) return null;
  return PLACES[mention.entityType.toLowerCase()]?.href(mention.entityId) ?? null;
}

/** The comment's text, or why there is none. */
export function mentionText(mention: MentionRow): string {
  return mention.excerpt ?? 'The comment has since been deleted.';
}
