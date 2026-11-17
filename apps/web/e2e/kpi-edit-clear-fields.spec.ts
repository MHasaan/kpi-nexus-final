/**
 * Plan 7.4: editing a KPI, a blank box was sent as "no change" — so a target,
 * a threshold or a unit, once set, could never be removed. A blank in an edit
 * now clears the field. And on an objective, emptying a key result's current
 * value saved it as 0.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('editing a KPI: a blank clears the field; a key result left blank is not saved as zero', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kec-${stamp}`,
      slug: `kec-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kec.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE', unit: '%', targetValue: 40, warningThreshold: 35, criticalThreshold: 30, description: 'Gross margin' },
  })).json()) as { id: string };
  const read = async () => (await (await api.get(`/kpis/${kpi.id}`)).json()) as Record<string, unknown>;
  expect(await read()).toMatchObject({ unit: '%', targetValue: 40, warningThreshold: 35, criticalThreshold: 30 });

  await page.goto(`/kpis/${kpi.id}/edit`);
  await expect(page.getByTestId('kpi-target')).toHaveValue('40');
  await page.getByTestId('kpi-target').fill('');
  await page.getByTestId('kpi-warning').fill('');
  await page.getByTestId('kpi-unit').fill('');
  await page.getByTestId('kpi-submit').click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}$`));

  // Cleared — and what was not touched is kept.
  expect(await read()).toMatchObject({ name: `Margin ${stamp}`, unit: null, targetValue: null, warningThreshold: null, criticalThreshold: 30, description: 'Gross margin' });

  // A key result: emptying the current value keeps the saved one and says why.
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const objective = (await (await api.post('/objectives', {
    data: { name: `Grow ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };
  const kr = (await (await api.post(`/objectives/${objective.id}/key-results`, { data: { name: 'Sign customers', targetValue: 100, currentValue: 60, weight: 1 } })).json()) as { id: string };
  await page.goto(`/okrs/${objective.id}`);
  const current = page.getByTestId(`kr-current-${kr.id}`);
  await expect(current).toHaveValue('60');
  await current.fill('');
  await current.blur();
  await expect(page.getByRole('alert').filter({ hasText: 'The saved value was kept' })).toBeVisible();
  await expect(current).toHaveValue('60'); // shown again, not left looking empty
  const saved = (await (await api.get(`/objectives/${objective.id}/key-results`)).json()) as Array<{ id: string; currentValue: number }>;
  expect(saved.find((k) => k.id === kr.id)!.currentValue).toBe(60);
});
