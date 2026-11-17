/**
 * Plan 6.11 / QA-M5: the Billing page showed a disabled "Upgrade (coming soon)"
 * button and "Users 0 / ∞". The plan can be changed from the page now (no
 * payment in this deployment) and the people in the organisation are counted.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('billing: people are counted and the plan can be changed from the page', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `bil-${stamp}`,
      slug: `bil-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@bil.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const invited = await api.post('/users', { data: { email: `second-${stamp}@bil.test.local`, fullName: 'Sam Second' } });
  expect(invited.ok()).toBeTruthy();

  await page.goto('/billing');
  await expect(page.getByTestId('billing-plan-name')).toHaveText('Enterprise');
  // The admin and the person just invited.
  await expect(page.getByTestId('billing-quota-users')).toContainText('People');
  await expect(page.getByTestId('billing-quota-users')).toContainText('2 · no limit');
  await expect(page.getByTestId('billing-no-payment')).toBeVisible();
  await expect(page.getByTestId('billing-plan-option-ENTERPRISE').getByTestId('billing-plan-current')).toBeVisible();

  // Move to Free: asks first, then the page shows the new plan and its limits.
  await page.getByTestId('billing-plan-choose-FREE').click();
  await expect(page.getByTestId('billing-plan-confirm')).toContainText('No payment is taken');
  await page.getByTestId('billing-plan-confirm-confirm').click();
  await expect(page.getByTestId('billing-plan-name')).toHaveText('Free');
  await expect(page.getByTestId('billing-plan-option-FREE').getByTestId('billing-plan-current')).toBeVisible();
  await expect(page.getByTestId('billing-quota-kpis')).toContainText('of 10');
  expect(((await (await api.get('/billing')).json()) as { planKey: string }).planKey).toBe('FREE');
});
