/**
 * Dashboard edit conflict-resolution e2e — optimistic concurrency UI.
 *
 * Exercises the 3-way diff dialog that appears when a dashboard's metadata is
 * edited concurrently (backend PATCH /dashboards/:id returns 412 Precondition
 * Failed when the If-Match version is stale).
 *
 * Flow:
 *   1. Create dashboard (version 1).
 *   2. Open the settings form in the browser — it captures base version 1.
 *   3. Out-of-band, PATCH the dashboard via API → server is now version 2.
 *   4. Edit the name in the browser and Save → backend returns 412.
 *   5. Conflict dialog appears showing mine vs. theirs.
 *   6a. "Keep mine" → re-PATCH against current version → succeeds; my name wins.
 *   6b. (separate dashboard) "Discard mine" → form reloads with their values.
 *
 * Requires the api at $API_URL (default http://localhost:4000).
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
    console.warn(
      `[skip] api not reachable at ${API_URL} — dashboard-conflict e2e skipped`,
    );
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
      orgName: `Conflict E2E ${stamp}`,
      slug: `conflict-${stamp}`,
      adminEmail: `admin-${stamp}@conflict.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Conflict Admin',
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

test.describe('Dashboard edit — optimistic concurrency conflict dialog', () => {
  test(
    'concurrent edit triggers conflict dialog; Keep mine overwrites',
    { tag: ['@conflict'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      const dashRes = await apiCtx.post('/dashboards', {
        data: { name: `Conflict Dash ${stamp}`, description: 'original' },
      });
      expect(dashRes.status()).toBe(201);
      const dash = (await dashRes.json()) as { id: string; version: number };
      expect(dash.version).toBe(1);

      await injectTokens(page, reg);
      await page.goto(`/dashboards/${dash.id}`);
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();

      // 1. Open settings form — captures base version 1.
      await page.getByTestId('dashboard-settings-toggle').click();
      await expect(page.getByTestId('dashboard-settings-form')).toBeVisible();

      // 2. Out-of-band edit via API → server becomes version 2.
      const theirName = `Their Name ${stamp}`;
      const patchRes = await apiCtx.patch(`/dashboards/${dash.id}`, {
        headers: { 'if-match': 'W/"1"' },
        data: { name: theirName },
      });
      expect(patchRes.status()).toBe(200);

      // 3. Edit name in the browser and save → expect 412 → conflict dialog.
      const myName = `My Name ${stamp}`;
      await page.getByTestId('dashboard-name-input').fill(myName);

      const saveResp = page.waitForResponse(
        (r) =>
          r.url().includes(`/dashboards/${dash.id}`) &&
          r.request().method() === 'PATCH',
      );
      await page.getByTestId('dashboard-settings-save').click();
      const resp = await saveResp;
      expect(resp.status()).toBe(412);

      // 4. Conflict dialog shows mine vs. theirs.
      await expect(page.getByTestId('dashboard-conflict-dialog')).toBeVisible();
      await expect(page.getByTestId('conflict-mine-name')).toContainText(myName);
      await expect(page.getByTestId('conflict-theirs-name')).toContainText(
        theirName,
      );

      // 5. Keep mine → re-PATCH against current version → my name wins.
      const keepResp = page.waitForResponse(
        (r) =>
          r.url().includes(`/dashboards/${dash.id}`) &&
          r.request().method() === 'PATCH',
      );
      await page.getByTestId('conflict-keep-mine').click();
      const keep = await keepResp;
      expect(keep.status()).toBe(200);

      await expect(
        page.getByTestId('dashboard-conflict-dialog'),
      ).not.toBeVisible();

      // Confirm the server now holds my name.
      const finalRes = await apiCtx.get(`/dashboards/${dash.id}`);
      const final = (await finalRes.json()) as { name: string };
      expect(final.name).toBe(myName);
    },
  );

  test(
    'Discard mine loads their values into the form',
    { tag: ['@conflict'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      const dashRes = await apiCtx.post('/dashboards', {
        data: { name: `Discard Dash ${stamp}` },
      });
      expect(dashRes.status()).toBe(201);
      const dash = (await dashRes.json()) as { id: string };

      await injectTokens(page, reg);
      await page.goto(`/dashboards/${dash.id}`);
      await expect(page.getByTestId('dashboard-detail-heading')).toBeVisible();

      await page.getByTestId('dashboard-settings-toggle').click();
      await expect(page.getByTestId('dashboard-settings-form')).toBeVisible();

      const theirName = `Theirs ${stamp}`;
      const patchRes = await apiCtx.patch(`/dashboards/${dash.id}`, {
        headers: { 'if-match': 'W/"1"' },
        data: { name: theirName },
      });
      expect(patchRes.status()).toBe(200);

      await page.getByTestId('dashboard-name-input').fill(`Mine ${stamp}`);
      await page.getByTestId('dashboard-settings-save').click();

      await expect(page.getByTestId('dashboard-conflict-dialog')).toBeVisible();

      // Discard mine → form input now reflects their name; no further conflict.
      await page.getByTestId('conflict-discard-mine').click();
      await expect(
        page.getByTestId('dashboard-conflict-dialog'),
      ).not.toBeVisible();
      await expect(page.getByTestId('dashboard-name-input')).toHaveValue(
        theirName,
      );
    },
  );
});
