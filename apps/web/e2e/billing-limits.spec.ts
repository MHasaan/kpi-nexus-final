/**
 * Plan 6.11: the Billing page shows a dashboards limit (and, where the plan has
 * one, a people limit) that nothing enforced. Past the limit the API answers
 * 402 QUOTA_EXCEEDED and the form says why.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Status { quotas: Array<{ key: string; limit: number; current: number }> }

test("billing: a dashboard past the plan's limit is refused, and the form says why", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `lim-${stamp}`,
      slug: `lim-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@lim.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const free = (await (await api.post('/billing/plan', { data: { planKey: 'FREE' } })).json()) as Status;
  const dashboards = free.quotas.find((q) => q.key === 'dashboards')!;
  expect(dashboards.limit).toBeGreaterThan(0);

  // Fill the plan.
  for (let i = dashboards.current; i < dashboards.limit; i++) {
    expect((await api.post('/dashboards', { data: { name: `Board ${i} ${stamp}` } })).status()).toBe(201);
  }
  const over = await api.post('/dashboards', { data: { name: `One too many ${stamp}` } });
  expect(over.status()).toBe(402);
  expect(((await over.json()) as { code: string }).code).toBe('QUOTA_EXCEEDED');

  // The same from the page: the reason is shown and the person stays on the form.
  await page.goto('/dashboards/new');
  await page.getByTestId('dashboards-new-name').fill(`From the page ${stamp}`);
  await page.getByTestId('dashboards-new-form').locator('button[type="submit"]').click();
  await expect(page.getByTestId('dashboards-new-error')).toContainText(`allows ${dashboards.limit} dashboards`);
  await expect(page).toHaveURL(/\/dashboards\/new$/);

  // People, where the plan limits them.
  const people = free.quotas.find((q) => q.key === 'users');
  if (people && people.limit > 0) {
    for (let i = people.current; i < people.limit; i++) {
      expect((await api.post('/users', { data: { email: `p${i}-${stamp}@lim.test.local`, fullName: `Person ${i}` } })).status()).toBe(201);
    }
    const extra = await api.post('/users', { data: { email: `extra-${stamp}@lim.test.local`, fullName: 'One Too Many' } });
    expect(extra.status()).toBe(402);
  }

  // A larger plan lifts it.
  await api.post('/billing/plan', { data: { planKey: 'ENTERPRISE' } });
  expect((await api.post('/dashboards', { data: { name: `After ${stamp}` } })).status()).toBe(201);
});
