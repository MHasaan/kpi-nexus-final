/**
 * QA-L9: a key result linked to a KPI showed no current value until someone
 * pressed "Sync from linked KPIs". It now starts from the KPI's value when the
 * link is made, by the same rule the sync uses.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('key result: linked to a KPI, it shows the KPI value without a sync', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `krv-${stamp}`,
      slug: `krv-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@krv.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Customers ${stamp}`, scope: 'ORG_WIDE', status: 'ACTIVE' } })).json()) as { id: string };
  const today = new Date().toISOString().slice(0, 10);
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 72, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);

  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const objective = (await (await api.post('/objectives', {
    data: { name: `Grow ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };

  // Linked when it is created, with no value typed.
  const created = (await (await api.post(`/objectives/${objective.id}/key-results`, {
    data: { name: 'Sign customers', baselineValue: 0, targetValue: 100, kpiId: kpi.id, weight: 1 },
  })).json()) as { id: string; currentValue: number | null; progress: number };
  expect(created.currentValue).toBe(72);
  expect(created.progress).toBeCloseTo(0.72);

  // Linked later: an existing key result takes the value then.
  const later = (await (await api.post(`/objectives/${objective.id}/key-results`, {
    data: { name: 'Keep customers', baselineValue: 0, targetValue: 144, weight: 1 },
  })).json()) as { id: string; currentValue: number | null };
  expect(later.currentValue).toBeNull();
  const linked = (await (await api.patch(`/objectives/${objective.id}/key-results/${later.id}`, { data: { kpiId: kpi.id } })).json()) as { currentValue: number | null; progress: number };
  expect(linked.currentValue).toBe(72);
  expect(linked.progress).toBeCloseTo(0.5);

  // The page shows it, and the objective's progress counts it, with no sync pressed.
  await page.goto(`/okrs/${objective.id}`);
  await expect(page.getByTestId(`kr-current-${created.id}`)).toHaveValue('72');
  await expect(page.getByTestId(`kr-${created.id}`).getByTestId('kr-progress')).toHaveText('72%');
  await expect(page.getByTestId('objective-progress')).toHaveText('61%');
});
