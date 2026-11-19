/**
 * Flow walk (activity): every row read "created a KPI value" or "created a
 * task" — not which KPI, what value, or which task — and led nowhere. A row
 * now names what it is about and links to it.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('the activity page says which KPI, what value and which task, and leads there', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `asw-${stamp}`,
      slug: `asw-${stamp}`,
      adminFullName: 'Asha Admin',
      adminEmail: `admin-${stamp}@asw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 1234, periodStart: '2026-01-01', periodEnd: '2026-01-31' } })).status()).toBe(201);
  expect((await api.post('/tasks', { data: { title: `Call the bank ${stamp}` } })).status()).toBe(201);

  await page.goto('/activity');
  const list = page.getByTestId('activity-list');
  await expect(list).toContainText(`Asha Admin created the task “Call the bank ${stamp}”`);
  await expect(list).toContainText(`Asha Admin recorded 1,234 on Revenue ${stamp}`);
  await expect(list).toContainText(`Asha Admin created the KPI “Revenue ${stamp}”`);
  await expect(list).not.toContainText('created a KPI value');

  await list.getByRole('link', { name: `recorded 1,234 on Revenue ${stamp}` }).click();
  await expect(page).toHaveURL(new RegExp(`/kpis/${kpi.id}$`));
});
