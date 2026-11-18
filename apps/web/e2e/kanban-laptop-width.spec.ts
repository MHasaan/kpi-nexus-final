/**
 * QA-L17: at laptop width the five Kanban columns were squeezed into the page,
 * so cards wrapped one word per line and the last column was cut off. Columns
 * now keep a readable width and the board scrolls sideways when they do not fit.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('Kanban at laptop width: columns stay readable and the last one can be reached', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `kbn-${stamp}`,
      slug: `kbn-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@kbn.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const title = 'Review the quarterly revenue numbers with finance';
  const task = (await (await api.post('/tasks', { data: { title, priority: 'HIGH' } })).json()) as { id: string };

  await page.goto('/tasks');
  const card = page.getByTestId(`task-${task.id}`);
  await expect(card).toBeVisible();

  // Every column is wide enough to read a card in.
  for (const status of ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']) {
    const box = await page.getByTestId(`column-${status}`).boundingBox();
    expect(box?.width ?? 0, `width of ${status}`).toBeGreaterThanOrEqual(220);
  }

  // The title takes a few lines, not one word per line.
  const titleBox = await card.getByTestId('task-title').boundingBox();
  expect(titleBox?.height ?? 999).toBeLessThanOrEqual(70);

  // The last column is reachable: scrolled into view, it sits wholly inside the board.
  const cancelled = page.getByTestId('column-CANCELLED');
  await cancelled.scrollIntoViewIfNeeded();
  const board = await page.getByTestId('kanban').boundingBox();
  const last = await cancelled.boundingBox();
  expect(last!.x + last!.width).toBeLessThanOrEqual(board!.x + board!.width + 1);

  // Only the board scrolls sideways — the page does not.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
