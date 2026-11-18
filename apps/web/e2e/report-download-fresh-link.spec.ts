/**
 * Plan 7.7 (report download): the Download link on a finished run was the
 * storage address signed when the report ran — dead after seven days. Download
 * now asks the API for a fresh address each time it is pressed.
 *
 * The run and the address are stubbed here (a real run needs the worker and
 * file storage); the API side is covered by report-download.service.spec.ts,
 * and the route is checked below against the real API for a run that does not exist.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('report run: Download asks for a fresh link each time and opens it', async ({ page }) => {
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
  expect((await api.get(`/scheduled-reports/${report.id}/runs/no-such-run/download`)).status()).toBe(404);
  expect((await (await request.newContext({ baseURL: API_URL })).get(`/scheduled-reports/${report.id}/runs/no-such-run/download`)).status()).toBe(401);

  // The page, with one finished run whose stored address is long dead.
  await page.route(`**/scheduled-reports/${report.id}`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const real = await route.fetch();
    const body = (await real.json()) as Record<string, unknown>;
    body.runs = [{ id: 'run_done', status: 'SUCCEEDED', ranAt: '2026-01-05T09:00:00.000Z', fileUrl: 'https://files.invalid/expired', error: null, createdAt: '2026-01-05T09:00:00.000Z' }];
    await route.fulfill({ response: real, json: body });
  });
  let asked = 0;
  await page.route(`**/scheduled-reports/${report.id}/runs/run_done/download`, async (route) => {
    asked += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `${new URL(page.url()).origin}/login?fresh-link=${asked}` }) });
  });

  await page.goto(`/reports/${report.id}`);
  const download = page.getByTestId('run-download-run_done');
  await expect(download).toBeVisible();
  // It is not a link to the stored address any more.
  expect(await download.getAttribute('href')).toBeNull();

  for (const n of [1, 2]) {
    const [popup] = await Promise.all([page.waitForEvent('popup'), download.click()]);
    await popup.waitForURL(`**/login?fresh-link=${n}`);
    await popup.close();
  }
  expect(asked).toBe(2);
});
