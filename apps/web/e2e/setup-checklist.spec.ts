/**
 * P6 SetupChecklistModule. API-level e2e via Playwright request. A fresh org
 * sees 13 pending tasks (lazy, no rows); status changes persist. Requires the
 * api at $API_URL.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn('[skip] api not reachable — setup-checklist skipped');
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function adminApi() {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  const reg = (await (await anon.post('/auth/register', {
    data: {
      orgName: `Checklist ${stamp}`,
      slug: `checklist-${stamp}`,
      adminEmail: `admin-${stamp}@checklist.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Checklist Admin',
    },
  })).json()) as { accessToken: string };
  return request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
}

interface View { items: Array<{ key: string; status: string }>; total: number; complete: number }

test('setup checklist: 13 lazy pending, complete/dismiss/reset persist', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();

  const fresh = (await (await api.get('/setup-checklist')).json()) as View;
  expect(fresh.total).toBe(13);
  expect(fresh.complete).toBe(0);
  expect(fresh.items.every((i) => i.status === 'pending')).toBe(true);

  // Complete one.
  const afterComplete = (await (await api.post('/setup-checklist/mfa/complete')).json()) as View;
  expect(afterComplete.complete).toBe(1);
  expect(afterComplete.items.find((i) => i.key === 'mfa')!.status).toBe('complete');

  // Dismiss another (persists, does not count as complete).
  const afterDismiss = (await (await api.post('/setup-checklist/okrs/dismiss')).json()) as View;
  expect(afterDismiss.items.find((i) => i.key === 'okrs')!.status).toBe('dismissed');
  expect(afterDismiss.complete).toBe(1);

  // Reset the completed one back to pending.
  const afterReset = (await (await api.post('/setup-checklist/mfa/reset')).json()) as View;
  expect(afterReset.items.find((i) => i.key === 'mfa')!.status).toBe('pending');
  expect(afterReset.complete).toBe(0);

  // Unknown key → 400.
  expect((await api.post('/setup-checklist/not_a_task/complete')).status()).toBe(400);
});

test('setup checklist: a task is done once the organisation has done it, and says where to do it', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();
  type Item = { key: string; status: string; detected: boolean; href: string; label: string };
  const items = async () => ((await (await api.get('/setup-checklist')).json()) as { items: Item[]; complete: number });

  const before = await items();
  expect(before.items.every((i) => i.href.startsWith('/'))).toBe(true);
  expect(before.items.some((i) => /post-P/i.test(i.label))).toBe(false);
  expect(before.items.find((i) => i.key === 'remaining_invites')).toMatchObject({ status: 'pending', detected: false, href: '/users' });

  // Do two of the things — nobody ticks anything.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  expect((await api.post('/users', { data: { email: `mate-${stamp}@checklist.test.local`, fullName: 'Team Mate' } })).status()).toBe(201);
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  expect((await api.post('/objectives', {
    data: { name: `Grow ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-10-01', periodEnd: '2026-12-31' },
  })).status()).toBe(201);

  const after = await items();
  expect(after.items.find((i) => i.key === 'remaining_invites')).toMatchObject({ status: 'complete', detected: true });
  expect(after.items.find((i) => i.key === 'okrs')).toMatchObject({ status: 'complete', detected: true });
  expect(after.complete).toBe(2);

  // "Undo" cannot un-do work that exists.
  const reset = (await (await api.post('/setup-checklist/okrs/reset')).json()) as { items: Item[] };
  expect(reset.items.find((i) => i.key === 'okrs')!.status).toBe('complete');
});

test('setup checklist requires auth (401)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.get('/setup-checklist')).status()).toBe(401);
});
