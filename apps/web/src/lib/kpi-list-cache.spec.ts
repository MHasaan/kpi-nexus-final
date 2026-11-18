import { describe, expect, it, vi } from 'vitest';

import { createKpiListCache } from './kpi-list-cache';

const rows = (name: string) => [{ id: name, name }];

describe('KPI list cache (plan 7.7)', () => {
  it('several pickers on one page share one request', async () => {
    const fetch = vi.fn(async () => rows('a'));
    const cache = createKpiListCache(fetch);
    const [one, two] = await Promise.all([cache.load('token-a', 0), cache.load('token-a', 10)]);
    expect(one).toBe(two);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("another session never gets the first one's list — it used to, until the page was reloaded", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(rows('org-a-kpi')).mockResolvedValueOnce(rows('org-b-kpi'));
    const cache = createKpiListCache(fetch);
    await cache.load('token-a', 0);
    expect(cache.peek('token-b', 1)).toBeNull();
    expect(await cache.load('token-b', 1)).toEqual(rows('org-b-kpi'));
  });

  it('with no session there is nothing cached to show', async () => {
    const cache = createKpiListCache(vi.fn(async () => rows('a')));
    await cache.load('token-a', 0);
    expect(cache.peek(null, 1)).toBeNull();
  });

  it('the list is asked for again after a minute, so a KPI made since then appears', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(rows('old')).mockResolvedValueOnce(rows('new'));
    const cache = createKpiListCache(fetch);
    await cache.load('token-a', 0);
    expect(cache.peek('token-a', 59_000)).toEqual(rows('old'));
    expect(cache.peek('token-a', 61_000)).toBeNull();
    expect(await cache.load('token-a', 61_000)).toEqual(rows('new'));
  });

  it('a failed request is not kept: the next picker tries again', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(rows('a'));
    const cache = createKpiListCache(fetch);
    await expect(cache.load('token-a', 0)).rejects.toThrow('down');
    expect(await cache.load('token-a', 1)).toEqual(rows('a'));
  });
});
