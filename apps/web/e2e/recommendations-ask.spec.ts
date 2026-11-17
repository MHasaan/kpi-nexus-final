/**
 * Plan 7.7 (recommendations): the page listed recommendations and offered no
 * way to ask for one, though the API has had the route all along.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('recommendations: ask for one about a KPI and it appears, named for that KPI', async ({ page }) => {
  test.setTimeout(60_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rca-${stamp}`,
      slug: `rca-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rca.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Latency ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'LOWER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };
  // Whether an AI provider answers here at all.
  const probe = await api.post('/recommendations/generate', { data: { kpiId: kpi.id } });
  test.skip(probe.status() !== 201, 'AI provider not available');

  await page.goto('/recommendations');
  const submit = page.getByTestId('recs-ask-submit');
  await expect(submit).toBeDisabled(); // nothing chosen yet
  await page.getByTestId('recs-ask-kpi').selectOption(kpi.id);
  await submit.click();
  await expect(page.getByTestId('toast').filter({ hasText: 'Recommendation ready' })).toContainText(`Latency ${stamp}`, { timeout: 30_000 });
  await expect(page.locator('[data-testid^="rec-row-"]')).toHaveCount(2); // the probe's and the one just asked for
  await expect(page.locator('[data-testid^="rec-kpi-"]').first()).toContainText(`Latency ${stamp}`);

  // A failure says no recommendation was made, and why.
  await page.route('**/recommendations/generate', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'The AI budget for today is used up' }) }));
  await page.getByTestId('recs-ask-kpi').selectOption(kpi.id);
  await submit.click();
  await expect(page.getByTestId('recs-error')).toHaveText('No recommendation was made: The AI budget for today is used up');
});
