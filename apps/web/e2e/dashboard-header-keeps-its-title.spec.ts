/**
 * Manual QA (2026-11-19, F-029): on a dashboard at laptop width the toolbar (Edit, Settings, Add widget,
 * Snapshot, History, Share, Print) took most of the header row, so the title wrapped to "Executive /
 * Overview" and the description was squeezed into a narrow column; a stray "Snapshot label (optional)" box
 * sat on its own under the header. The toolbar now has its own row under the title, with the label beside
 * the Snapshot button.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('a dashboard’s title keeps the width it needs at laptop width, and the toolbar sits under it', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `hdr-${stamp}`,
      slug: `hdr-${stamp}`,
      adminFullName: 'Hana Admin',
      adminEmail: `admin-${stamp}@hdr.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const board = (await (await api.post('/dashboards', { data: { name: 'Executive Overview', description: 'The numbers the leadership team watches each week', isShared: true } })).json()) as { id: string };

  await page.setViewportSize({ width: 1140, height: 800 });
  await page.goto(`/dashboards/${board.id}`);
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText('Executive Overview');
  await expect(page.getByTestId('dashboard-edit-toggle')).toBeVisible();

  const box = await title.boundingBox();
  const lineHeight = await title.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect(box!.height).toBeLessThan(lineHeight * 1.5); // one line
  expect(box!.width).toBeGreaterThan(200);

  const toolbar = await page.getByTestId('dashboard-toolbar').boundingBox();
  expect(toolbar!.y).toBeGreaterThanOrEqual(box!.y + box!.height); // under the title, not beside it

  // The snapshot label is part of the Snapshot control, not a box on its own.
  const label = page.getByTestId('snapshot-label-input');
  await expect(label).toBeVisible();
  const labelBox = await label.boundingBox();
  const snap = await page.getByTestId('dashboard-snapshot-btn').boundingBox();
  expect(Math.abs(labelBox!.y - snap!.y)).toBeLessThan(12); // on the same row
});
