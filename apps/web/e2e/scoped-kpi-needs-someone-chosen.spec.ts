/**
 * Flow walk (new KPI): a per-person KPI made with nobody ticked failed, after
 * pressing Create, with the stored message "PER_USER KPIs require at least
 * one userId" at the foot of a long form — and the form's own text said a
 * KPI could be made first and "assigned later", which the API refuses.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a per-person or per-unit KPI says who must be chosen, in words, before it is sent', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `skn-${stamp}`,
      slug: `skn-${stamp}`,
      adminFullName: 'Sol Admin',
      adminEmail: `admin-${stamp}@skn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const posts: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/kpis') posts.push(req.url());
  });

  // Per person, nobody ticked: said beside the people, and nothing is sent.
  await page.goto('/kpis/new?scope=PER_USER');
  await page.getByTestId('kpi-name').fill(`Calls ${stamp}`);
  await page.getByTestId('kpi-submit').click();
  const problem = page.getByTestId('kpi-assign-problem');
  await expect(problem).toHaveText('Choose at least one person who will record this KPI.');
  await expect(page.getByRole('main')).not.toContainText('userId');
  expect(posts).toEqual([]);

  // Per unit, with no unit in the organisation: the form says one is needed first — not "assign later".
  await page.getByTestId('kpi-scope').selectOption('PER_UNIT');
  const units = page.getByTestId('kpi-orgunit-picker');
  await expect(units).toContainText('needs at least one');
  await expect(units).not.toContainText('assign later');
  await page.getByTestId('kpi-submit').click();
  await expect(problem).toHaveText('Choose at least one unit that will record this KPI.');
  expect(posts).toEqual([]);

  // With someone ticked it is created.
  await page.getByTestId('kpi-scope').selectOption('PER_USER');
  await page.getByTestId('kpi-user-picker').getByLabel('Sol Admin').check();
  await page.getByTestId('kpi-submit').click();
  await expect(page).toHaveURL(/\/kpis\/[a-z0-9]+$/);
  const made = (await (await api.get('/kpis')).json()) as Array<{ name: string; scope: string }>;
  expect(made.find((k) => k.name === `Calls ${stamp}`)?.scope).toBe('PER_USER');
});
