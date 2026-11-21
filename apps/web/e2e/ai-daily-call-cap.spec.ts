/**
 * Manual QA (2026-11-19, F-045): AI spend was never recorded ($0.00 on the free tier), so the $1/day and
 * $30/month caps could never trigger, and a busy day could use the provider's whole free quota. Calls are
 * now counted too: an organisation has a daily call limit (300 to begin with), shown and set on the AI
 * settings page and enforced like the spend caps.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Budget {
  dailyCalls: number;
  dailyCallCap: number;
}

test('AI calls are counted and capped per day, and the limit is set on the AI settings page', async ({ page }) => {
  test.setTimeout(90_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `calls-${stamp}`,
      slug: `calls-${stamp}`,
      adminFullName: 'Cal Admin',
      adminEmail: `admin-${stamp}@calls.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const budget = async () => (await (await api.get('/ai/budget')).json()) as Budget;

  // A new organisation starts with 300 calls a day and none made.
  expect(await budget()).toMatchObject({ dailyCalls: 0, dailyCallCap: 300 });

  // The page shows the count and the limit, and the limit can be changed.
  await page.goto('/settings/ai');
  await expect(page.getByTestId('ai-calls-today')).toContainText('limit 300');
  await expect(page.getByTestId('ai-call-cap-input')).toHaveValue('300');
  await page.getByTestId('ai-call-cap-input').fill('2.5');
  await page.getByTestId('ai-save-cap').click();
  await expect(page.getByTestId('ai-budget-form-error')).toContainText('whole number');
  await page.getByTestId('ai-call-cap-input').fill('250');
  await page.getByTestId('ai-save-cap').click();
  await expect(page.getByTestId('ai-settings-success')).toBeVisible();
  expect((await budget()).dailyCallCap).toBe(250);

  // A call is counted whatever it costs; once the day's limit is reached the next one is refused.
  const kpi = (await (await api.post('/kpis', { data: { name: `MRR ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY' } })).json()) as { id: string };
  expect((await api.post(`/kpis/${kpi.id}/data`, { data: { value: 100, periodStart: '2026-10-01', periodEnd: '2026-10-31' } })).status()).toBe(201);
  const first = await api.post('/nlq/ask', { data: { question: 'How is MRR doing?' } });
  expect(first.status(), await first.text()).toBeLessThan(300);
  const made = (await budget()).dailyCalls;
  expect(made).toBeGreaterThan(0);
  expect((await api.patch('/ai/budget', { data: { dailyCallCap: made } })).status()).toBeLessThan(300);
  const refused = await api.post('/nlq/ask', { data: { question: 'And churn?' } });
  expect(refused.status()).toBe(402);
  expect((await refused.json()) as { code: string; message: string; details: { reason: string } }).toMatchObject({
    code: 'AI_BUDGET_EXCEEDED',
    details: { reason: 'DAILY_CALLS' },
    message: expect.stringMatching(/call limit/i),
  });
  expect((await budget()).dailyCalls).toBe(made); // the refused call was not counted
});
