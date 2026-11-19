/**
 * Flow walk (first use): the form that records a value has a "Note (optional)"
 * box, and the note was never seen again — the values table had no place for
 * it. On a per-person KPI's own page it was not even sent. A note is now kept
 * and shown beside its value.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a note typed with a value is kept and shown beside it', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `vnk-${stamp}`,
      slug: `vnk-${stamp}`,
      adminFullName: 'Nora Admin',
      adminEmail: `admin-${stamp}@vnk.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const me = ((await (await api.get('/auth/me')).json()) as { user: { id: string } }).user;

  // A KPI recorded for the whole organisation.
  const shared = (await (await api.post('/kpis', { data: { name: `Sales ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  await page.goto(`/kpis/${shared.id}?tab=data`);
  await page.getByTestId('data-value').fill('120');
  await page.getByTestId('data-note').fill('Two public holidays this month');
  await page.getByTestId('data-record').click();
  await expect(page.getByTestId('data-point-note').first()).toHaveText('Two public holidays this month');

  // A KPI each person records for themself: the note typed on the KPI's own page is sent too.
  const own = (await (await api.post('/kpis', { data: { name: `Calls ${stamp}`, scope: 'PER_USER', userIds: [me.id] } })).json()) as { id: string };
  await page.goto(`/kpis/${own.id}?tab=data`);
  await page.getByTestId('data-value').fill('31');
  await page.getByTestId('data-note').fill('Half a week of leave');
  await page.getByTestId('data-record').click();
  await expect(page.getByTestId('data-point-note').first()).toHaveText('Half a week of leave');
  const points = (await (await api.get(`/kpis/${own.id}/data`)).json()) as Array<{ value: number; note: string | null }>;
  expect(points[0]).toMatchObject({ value: 31, note: 'Half a week of leave' });
});
