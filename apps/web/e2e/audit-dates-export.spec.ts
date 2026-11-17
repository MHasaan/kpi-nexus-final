/**
 * Plan 6.13: the audit log showed the newest 100 rows with no dates, no way to
 * see older rows and no export.
 */
import { readFile } from 'node:fs/promises';

import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('audit log: date filter, a bad date is refused, and the CSV export', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `aud-${stamp}`,
      slug: `aud-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@aud.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  await api.post('/kpis', { data: { name: `Audited ${stamp}`, scope: 'ORG_WIDE', unit: '%' } });

  const today = new Date().toISOString().slice(0, 10);
  const all = (await (await api.get(`/audit?from=${today}&to=${today}`)).json()) as unknown[];
  expect(all.length).toBeGreaterThan(0);
  // Nothing was written before the organisation existed.
  expect(await (await api.get('/audit?to=2000-01-01')).json()).toEqual([]);
  const bad = await api.get('/audit?from=yesterday');
  expect(bad.status()).toBe(400);
  expect(((await bad.json()) as { message: string }).message).toContain('from must be a date');

  await page.goto('/settings/audit');
  await expect(page.getByTestId('audit-list')).toBeVisible();
  // A range in the past: nothing.
  await page.getByTestId('filter-to').fill('2000-01-01');
  await page.getByTestId('audit-apply-filters').click();
  await expect(page.getByTestId('audit-empty')).toBeVisible();
  // Today: the rows again, and the person filter offers who acted.
  await page.getByTestId('filter-to').fill(today);
  await page.getByTestId('filter-from').fill(today);
  await page.getByTestId('audit-apply-filters').click();
  await expect(page.getByTestId('audit-list')).toBeVisible();
  await expect(page.getByTestId('filter-person').locator('option', { hasText: `admin-${stamp}@aud.test.local` })).toHaveCount(1);

  // The export is a CSV file with the same rows.
  const download = page.waitForEvent('download');
  await page.getByTestId('audit-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await readFile((await file.path())!, 'utf8');
  const lines = csv.trim().split('\r\n');
  expect(lines[0]).toBe('Time (UTC),Action,Entity type,Entity id,Person,Redacted fields');
  expect(lines.length - 1).toBe(all.length);
  expect(csv).toContain(`admin-${stamp}@aud.test.local`);
});
