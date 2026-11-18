/**
 * The list of KPIs the pickers on a page share, so several of them do not each
 * ask for it. It belongs to one signed-in session and is asked for again after
 * a minute.
 *
 * It used to be one module-level list with no owner and no age: someone who
 * signed in after another person in the same tab was shown the first person's
 * KPIs, and a KPI created after the list was first read did not appear until
 * the page was reloaded.
 */

/** How long a list is reused before it is asked for again. */
export const KPI_LIST_MAX_AGE_MS = 60_000;

export interface KpiListCache<T> {
  /** The list, if this session has a fresh one; null otherwise. */
  peek(token: string | null, now?: number): T[] | null;
  /** The list for this session: the fresh one, the request already under way, or a new request. */
  load(token: string | null, now?: number): Promise<T[]>;
}

export function createKpiListCache<T>(fetchList: () => Promise<T[]>): KpiListCache<T> {
  let entry: { token: string; at: number; rows: T[] | null; request: Promise<T[]> } | null = null;

  const current = (token: string | null, now: number) =>
    token !== null && entry !== null && entry.token === token && now - entry.at < KPI_LIST_MAX_AGE_MS ? entry : null;

  return {
    peek(token, now = Date.now()) {
      return current(token, now)?.rows ?? null;
    },
    load(token, now = Date.now()) {
      const fresh = current(token, now);
      if (fresh) return fresh.request;
      // No session: ask (the API will answer for whoever it is), and keep nothing.
      if (token === null) return fetchList();
      const mine = { token, at: now, rows: null as T[] | null, request: null as unknown as Promise<T[]> };
      mine.request = fetchList().then(
        (rows) => {
          mine.rows = rows;
          return rows;
        },
        (err: unknown) => {
          // A failure is not kept: the next picker tries again.
          if (entry === mine) entry = null;
          throw err;
        },
      );
      entry = mine;
      return mine.request;
    },
  };
}
