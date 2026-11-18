/**
 * Found by the final page crawl: opening the home page signed out asked the
 * API "who am I?" and was told nobody (401) before going to the sign-in page.
 * With no session there is nothing to ask.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('signed out: a page goes to sign-in without asking the API anything it will be refused', async ({ page }) => {
  const up = await page.request.get(`${API_URL}/health`).catch(() => null);
  test.skip(!up?.ok(), 'api not reachable');

  const refused: string[] = [];
  page.on('response', (r) => {
    if (r.url().startsWith(API_URL) && r.status() >= 400) refused.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  for (const route of ['/dashboard', '/kpis', '/tasks', '/alerts']) {
    await page.goto(route);
    await page.waitForURL(/\/login/);
    await page.waitForLoadState('networkidle');
  }
  expect(refused).toEqual([]);
});
