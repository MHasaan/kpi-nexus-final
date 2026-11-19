/**
 * Flow walk (keyboard): "Skip to content" jumped to a wrapper around the whole
 * app — menu included — because two elements carried the id it points at. On a
 * signed-in page it now lands on the page's own content, past the menu.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('"Skip to content" lands on the page content, past the menu', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `skl-${stamp}`,
      slug: `skl-${stamp}`,
      adminFullName: 'Kay Admin',
      adminEmail: `admin-${stamp}@skl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  await page.goto('/kpis');
  await expect(page.getByRole('main')).toBeVisible();

  // One element answers to the link's target, and it is the page's content.
  const targets = await page.evaluate(() => [...document.querySelectorAll('#main-content')].map((el) => el.tagName));
  expect(targets).toEqual(['MAIN']);

  // By keyboard: the first Tab reaches the link, Enter follows it, and the next Tab is inside the content — not the menu.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  const where = await page.evaluate(() => ({
    inContent: !!document.activeElement?.closest('main#main-content'),
    inMenu: !!document.activeElement?.closest('nav[aria-label="Primary"]'),
  }));
  expect(where).toEqual({ inContent: true, inMenu: false });
});
