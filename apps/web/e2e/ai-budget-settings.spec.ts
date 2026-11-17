/**
 * Plan 6.12: on AI settings only the daily cap could be changed, and a blank
 * cap was sent as 0 — which means "no cap". The monthly cap and what happens
 * at the cap are settable now, a blank is refused, and a pasted key is masked.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Budget { dailyCapUsd: number; monthlyCapUsd: number; circuitBreaker: string }

test('AI budget: a blank cap is refused; monthly cap and what happens at the cap are saved', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `aib-${stamp}`,
      slug: `aib-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@aib.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const read = async () => (await (await api.get('/ai/budget')).json()) as Budget;
  const before = await read();

  await page.goto('/settings/ai');
  const daily = page.getByTestId('ai-daily-cap-input');
  await expect(daily).toHaveValue(String(before.dailyCapUsd));

  // Blank: refused on the page, nothing saved.
  await daily.fill('');
  await page.getByTestId('ai-save-cap').click();
  await expect(page.getByTestId('ai-budget-form-error')).toContainText('Daily cap');
  expect((await read()).dailyCapUsd).toBe(before.dailyCapUsd);

  // All three saved together.
  await daily.fill('2.5');
  await page.getByTestId('ai-monthly-cap-input').fill('40');
  await page.getByTestId('ai-circuit-breaker-select').selectOption('FALLBACK');
  await page.getByTestId('ai-save-cap').click();
  await expect(page.getByTestId('ai-settings-success')).toBeVisible();
  expect(await read()).toMatchObject({ dailyCapUsd: 2.5, monthlyCapUsd: 40, circuitBreaker: 'FALLBACK' });

  // A key being pasted is not shown.
  await expect(page.locator('[data-testid^="ai-byo-"][data-testid$="-input"]:not([disabled])').first()).toHaveAttribute('type', 'password');
});
