/**
 * Share-link e2e — Public dashboard sharing.
 *
 * Flow:
 *   Admin registers → creates a dashboard → navigates to /dashboards/:id/share
 *   → creates a share link (no password) → captures the public URL/token
 *   → opens /share/<token> in a NEW incognito context (no auth) → asserts the
 *   public viewer renders (`public-dashboard-viewer`) → goes back → revokes
 *   the link → reloads the public page → asserts "not found" messaging.
 *
 * Requires the api to be reachable at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — share-link e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

async function registerOrg(stamp: string): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Share E2E ${stamp}`,
      slug: `share-${stamp}`,
      adminEmail: `admin-${stamp}@share.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Share Admin',
    },
  });
  expect(regRes.status()).toBe(201);
  return regRes.json() as Promise<RegisterResult>;
}

async function injectTokens(
  page: import('@playwright/test').Page,
  reg: RegisterResult,
): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('Share link — public dashboard access', () => {
  test(
    'create share link → public viewer renders → revoke → not-found',
    { tag: ['@share'] },
    async ({ page, browser }) => {
      test.skip(!apiAvailable, 'api not reachable');

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      // 1. Create a dashboard via API
      const dashRes = await apiCtx.post('/dashboards', {
        data: { name: `Share Dashboard ${stamp}` },
      });
      expect(dashRes.status()).toBe(201);
      const dash = (await dashRes.json()) as { id: string; name: string };

      // 2. Navigate to the share page
      await injectTokens(page, reg);
      await page.goto(`/dashboards/${dash.id}/share`);
      await expect(page.getByTestId('share-heading')).toBeVisible();

      // 3. Create a link (no password, no expiry)
      await page.getByTestId('share-create-submit').click();

      // Wait for the new-link result to appear
      await expect(page.getByTestId('share-new-link-result')).toBeVisible({
        timeout: 15_000,
      });

      // 4. Capture the public URL from the UI
      const urlCode = page.getByTestId('share-new-link-url');
      await expect(urlCode).toBeVisible();
      const rawUrl = (await urlCode.textContent()) ?? '';
      expect(rawUrl).toMatch(/\/share\//);

      // Extract the token from the URL (last path segment)
      const token = rawUrl.split('/share/')[1]?.trim() ?? '';
      expect(token.length).toBeGreaterThan(4);

      // 5. Link should also appear in the active-links list
      const linkRow = page.getByTestId('share-link-row').first();
      await expect(linkRow).toBeVisible();

      // 6. Open /share/<token> in a fresh incognito context (no auth)
      const incognito = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const publicPage = await incognito.newPage();
      await publicPage.goto(`/share/${token}`);

      // 7. The public viewer should render
      await expect(publicPage.getByTestId('public-dashboard-viewer')).toBeVisible({
        timeout: 20_000,
      });

      await incognito.close();

      // 8. Back on the share page — get the link id to click its revoke button
      //    The revoke button has testid `share-link-revoke-<linkId>`.
      //    We can get the linkId from the API.
      const linksRes = await apiCtx.get(`/dashboards/${dash.id}/share`);
      expect(linksRes.status()).toBe(200);
      const links = (await linksRes.json()) as Array<{
        id: string;
        revokedAt: string | null;
        token: string;
      }>;
      const activeLink = links.find((l) => l.token === token && !l.revokedAt);
      expect(activeLink).toBeDefined();
      const linkId = activeLink!.id;

      // 9. Revoke the link via UI — handle the window.confirm dialog
      page.on('dialog', (dialog) => void dialog.accept());
      const revokeButton = page.getByTestId(`share-link-revoke-${linkId}`);
      await expect(revokeButton).toBeVisible();
      await revokeButton.click();

      // After revoke the active-links list should show "No active share links"
      await expect(page.getByTestId('share-links-empty')).toBeVisible({
        timeout: 15_000,
      });

      // 10. Open the now-revoked public URL in a new incognito context
      const incognito2 = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const publicPage2 = await incognito2.newPage();
      await publicPage2.goto(`/share/${token}`);

      // Should show "not found" state
      await expect(publicPage2.getByTestId('share-not-found')).toBeVisible({
        timeout: 20_000,
      });

      await incognito2.close();
    },
  );

  test(
    'share page requires authentication — redirects to /login',
    { tag: ['@share'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');

      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.removeItem('kpi-nexus.access-token');
        window.localStorage.removeItem('kpi-nexus.refresh-token');
      });
      // Use a fake dashboard id — the auth guard should redirect before hitting API
      await page.goto('/dashboards/fake-id/share');
      await expect(page).toHaveURL(/\/login$/);
    },
  );

  test(
    'public share page for unknown token shows not-found without auth',
    { tag: ['@share'] },
    async ({ browser }) => {
      test.skip(!apiAvailable, 'api not reachable');

      const incognito = await browser.newContext({
        storageState: { cookies: [], origins: [] },
      });
      const publicPage = await incognito.newPage();
      await publicPage.goto('/share/this-token-does-not-exist-xyz9999');

      // The page should show either not-found or error — not a crash
      const notFound = publicPage.getByTestId('share-not-found');
      const errState = publicPage.getByTestId('share-error');
      const expired = publicPage.getByTestId('share-expired');

      await expect(notFound.or(errState).or(expired)).toBeVisible({ timeout: 15_000 });

      await incognito.close();
    },
  );
});
