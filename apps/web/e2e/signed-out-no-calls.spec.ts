/**
 * Found by the end-of-batch crawl: /team and /users/[id] asked the API for
 * their data before noticing nobody was signed in, so a signed-out visitor drew
 * up to five 401s on the way to /login. A page with no session asks for nothing.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

// No stored session at all.
test.use({ storageState: { cookies: [], origins: [] } });

for (const path of ['/team', '/users/some-person-id']) {
  test(`${path} signed out: straight to sign-in, without calling the api`, async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => {
      if (r.url().startsWith(API_URL)) calls.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.waitForLoadState('networkidle');
    expect(calls).toEqual([]);
  });
}
