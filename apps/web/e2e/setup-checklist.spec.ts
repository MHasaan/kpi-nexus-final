/**
 * P6 SetupChecklistModule. API-level e2e via Playwright request. A fresh org
 * sees 14 pending tasks (lazy, no rows); status changes persist. Requires the
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

test('setup checklist: 14 lazy pending, complete/dismiss/reset persist', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const api = await adminApi();

  const fresh = (await (await api.get('/setup-checklist')).json()) as View;
  expect(fresh.total).toBe(14);
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

test('setup checklist requires auth (401)', async () => {
  test.skip(!apiAvailable, 'api not reachable');
  const anon = await request.newContext({ baseURL: API_URL });
  expect((await anon.get('/setup-checklist')).status()).toBe(401);
});
