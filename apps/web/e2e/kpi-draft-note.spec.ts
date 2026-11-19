/**
 * QA-L1: KPIs made from a template (and by the form's default) are Draft, and
 * nothing said what that means — a new organisation saw twenty "DRAFT" badges
 * and no word on whether they work. The list now says so, once, while there is
 * a draft to say it about.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('KPI list: says what Draft means while there is a draft, and not otherwise', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `drf-${stamp}`,
      slug: `drf-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@drf.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });

  // Only an active KPI: nothing to explain.
  const active = `Active ${stamp}`;
  expect((await api.post('/kpis', { data: { name: active, scope: 'ORG_WIDE', status: 'ACTIVE' } })).status()).toBe(201);
  await page.goto('/kpis');
  await expect(page.getByTestId(`kpi-status-badge-${active}`)).toHaveText('Active');
  await expect(page.getByTestId('kpis-draft-note')).toHaveCount(0);

  // A draft appears: the list says what that means, and how to change it.
  const draft = `Draft ${stamp}`;
  expect((await api.post('/kpis', { data: { name: draft, scope: 'ORG_WIDE' } })).status()).toBe(201);
  await page.reload();
  await expect(page.getByTestId(`kpi-status-badge-${draft}`)).toHaveText('Draft');
  const note = page.getByTestId('kpis-draft-note');
  await expect(note).toContainText('1 KPI is a draft');
  await expect(note).toContainText('takes values');
  await expect(note).toContainText('Edit');

  // Flow walk (new KPI): the form said the opposite — "Draft KPIs are hidden from most views until Active."
  await page.goto('/kpis/new');
  const statusHelp = page.getByTestId('kpi-status-help');
  await expect(statusHelp).toContainText('takes values and appears on dashboards like any other');
  await expect(page.getByRole('main')).not.toContainText('hidden from most views');
  await page.goto('/kpis');

  // "Show drafts" narrows the list to them.
  await note.getByRole('button', { name: 'Show drafts' }).click();
  await expect(page.getByTestId(`kpi-status-badge-${draft}`)).toBeVisible();
  await expect(page.getByTestId(`kpi-status-badge-${active}`)).toHaveCount(0);
});
