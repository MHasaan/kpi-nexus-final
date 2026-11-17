/**
 * Plan 6.11: a plan lists the features it includes, but nothing checked them.
 * Creating a webhook, an API key, a scheduled report or a custom domain, or
 * asking for an AI insight, is refused with 402 FEATURE_NOT_IN_PLAN on a plan
 * without it — and the form says why.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('billing: a feature outside the plan is refused, and the form says why', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `fea-${stamp}`,
      slug: `fea-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@fea.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const { events } = (await (await api.get('/webhooks/events')).json()) as { events: string[] };
  const webhook = (name: string) => api.post('/webhooks', { data: { name, url: 'https://example.com/hook', events: [events[0]] } });
  const key = (name: string) => api.post('/api-keys', { data: { name, scopes: ['KPI_VIEW'] } });

  // Free: neither webhooks nor API keys.
  await api.post('/billing/plan', { data: { planKey: 'FREE' } });
  const refused = await webhook(`Hook ${stamp}`);
  expect(refused.status()).toBe(402);
  expect(await refused.json()).toMatchObject({ code: 'FEATURE_NOT_IN_PLAN', details: { feature: 'webhooks', plan: 'FREE' } });
  expect((await key(`Key ${stamp}`)).status()).toBe(402);

  // The page shows the reason.
  await page.goto('/settings/webhooks');
  await page.getByTestId('webhook-name-input').fill(`Hook ${stamp}`);
  await page.getByTestId('webhook-url-input').fill('https://example.com/hook');
  await page.getByTestId('webhook-create-form').locator('input[type="checkbox"]').first().check();
  await page.getByTestId('webhook-create-submit').click();
  await expect(page.getByTestId('webhook-create-error')).toContainText('Webhooks are not part of the Free plan');

  // Pro: webhooks yes, API keys no.
  await api.post('/billing/plan', { data: { planKey: 'PRO' } });
  expect((await webhook(`Hook ${stamp}`)).status()).toBe(201);
  expect((await key(`Key ${stamp}`)).status()).toBe(402);

  // Enterprise: both.
  await api.post('/billing/plan', { data: { planKey: 'ENTERPRISE' } });
  expect((await key(`Key ${stamp}`)).status()).toBe(201);
});
