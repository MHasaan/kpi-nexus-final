/**
 * Plan 7.7 and manual QA (2026-11-19, F-044): a finished report's download was a storage address, signed when the
 * report ran and good for seven days, and in production one no reader could reach. The page's Download now
 * fetches the file through the app itself, signed in, and saves it under the report's name.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('report run: Download fetches the file through the app and saves it under the report\'s name', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `rdl-${stamp}`,
      slug: `rdl-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@rdl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const report = (await (await api.post('/scheduled-reports', {
    data: { name: `Weekly ${stamp}`, cron: '0 9 * * 1', format: 'CSV', recipients: [`r-${stamp}@example.com`] },
  })).json()) as { id: string };

  // The real API: a run that does not exist has nothing to download; signed out, nothing at all.
  expect((await api.get(`/scheduled-reports/${report.id}/runs/no-such-run/file`)).status()).toBe(404);
  expect((await (await request.newContext({ baseURL: API_URL })).get(`/scheduled-reports/${report.id}/runs/no-such-run/file`)).status()).toBe(401);

  // The page, with one finished run whose stored address is long dead.
  await page.route(`**/scheduled-reports/${report.id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const real = await route.fetch();
    const body = (await real.json()) as Record<string, unknown>;
    body.runs = [{ id: 'run_done', status: 'SUCCEEDED', ranAt: '2026-01-05T09:00:00.000Z', fileUrl: 'https://files.invalid/expired', error: null, createdAt: '2026-01-05T09:00:00.000Z' }];
    await route.fulfill({ response: real, json: body });
  });
  let asked = 0;
  await page.route(`**/scheduled-reports/${report.id}/runs/run_done/file`, async (route) => {
    asked += 1;
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="Weekly ${stamp} 2026-01-05.csv"`,
        'access-control-expose-headers': 'content-disposition',
      },
      body: 'kpi,value\nMRR,1\n',
    });
  });

  await page.goto(`/reports/${report.id}`);
  const download = page.getByTestId('run-download-run_done');
  await expect(download).toBeVisible();
  expect(await download.getAttribute('href')).toBeNull();

  const [saved] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(saved.suggestedFilename()).toBe(`Weekly ${stamp} 2026-01-05.csv`);
  expect(asked).toBe(1);
});
