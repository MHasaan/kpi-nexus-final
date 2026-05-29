/**
 * UC-Alerts e2e — create an alert rule via the UI, breach it via the API, and
 * verify the alert surfaces in the inbox and can be acknowledged.
 *
 * Flow:
 *   1. Register org + create a KPI (API).
 *   2. UI: /alerts/new → fill STATIC_THRESHOLD rule (> 100) → submit → /alerts.
 *   3. API: record a breaching data point (150).
 *   4. UI: the alert appears in /alerts (async BullMQ eval — poll via reload).
 *   5. UI: acknowledge → status becomes ACKNOWLEDGED.
 *
 * Requires the api at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — uc-alerts skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
}

async function registerOrg(stamp: string): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const res = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Alerts E2E ${stamp}`,
      slug: `alerts-${stamp}`,
      adminEmail: `admin-${stamp}@alerts.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Alerts Admin',
    },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<RegisterResult>;
}

async function injectTokens(page: import('@playwright/test').Page, reg: RegisterResult): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('UC-Alerts — rule builder → breach → inbox → acknowledge', () => {
  test(
    'create STATIC_THRESHOLD rule in UI, breach via API, acknowledge in inbox',
    { tag: ['@alerts'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');
      // Generous budget: in `next dev` the /alerts routes compile cold on first
      // hit, and the alert is raised asynchronously via BullMQ.
      test.setTimeout(120_000);

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      // KPI to attach the rule to.
      const kpiRes = await apiCtx.post('/kpis', {
        data: {
          name: `Alert KPI ${stamp}`,
          scope: 'ORG_WIDE',
          type: 'NUMBER',
          unit: 'pts',
          aggregationMethod: 'LAST',
        },
      });
      expect(kpiRes.status()).toBe(201);
      const kpi = (await kpiRes.json()) as { id: string };

      // Build the rule via the UI.
      await injectTokens(page, reg);
      await page.goto('/alerts/new');
      await expect(page.getByTestId('new-rule-heading')).toBeVisible();

      await page.getByTestId('rule-name-input').fill(`High value ${stamp}`);
      await page.getByTestId('rule-kpi-select').selectOption(kpi.id);
      await page.getByTestId('rule-type-select').selectOption('STATIC_THRESHOLD');
      await page.getByTestId('rule-operator-select').selectOption('>');
      await page.getByTestId('rule-threshold-input').fill('100');
      await page.getByTestId('rule-severity-select').selectOption('HIGH');

      const createResp = page.waitForResponse(
        (r) => r.url().includes('/alert-rules') && r.request().method() === 'POST',
      );
      await page.getByTestId('rule-submit').click();
      const created = await createResp;
      expect(created.status()).toBe(201);

      // Redirected to the inbox.
      await expect(page).toHaveURL(/\/alerts$/);
      await expect(page.getByTestId('alerts-heading')).toBeVisible();

      // Breach the threshold via the API.
      const dpRes = await apiCtx.post(`/kpis/${kpi.id}/data`, {
        data: {
          value: 150,
          periodStart: '2026-05-29T00:00:00.000Z',
          periodEnd: '2026-05-29T12:00:00.000Z',
        },
      });
      expect(dpRes.status()).toBe(201);

      // The alert is raised asynchronously (BullMQ). Wait for it via the API
      // (source of truth) before asserting the UI renders it — reloading inside
      // a poll is fragile under cold dev-server compiles.
      await expect
        .poll(
          async () => {
            const res = await apiCtx.get('/alerts?status=OPEN');
            const list = (await res.json()) as unknown[];
            return Array.isArray(list) ? list.length : 0;
          },
          { timeout: 60_000, intervals: [1000, 1000, 2000, 2000, 3000] },
        )
        .toBeGreaterThan(0);

      // Now reload the UI once and assert the row shows with the breach value.
      await page.reload();
      await page.getByTestId('alerts-heading').waitFor();
      const alertRow = page.locator('[data-testid^="alert-row-"]').first();
      await expect(alertRow).toContainText('150', { timeout: 15_000 });

      // Acknowledge it.
      const ackBtn = alertRow.locator('[data-testid^="alert-ack-"]');
      await expect(ackBtn).toBeVisible();
      await ackBtn.click();

      // After ack, switch the filter to Acknowledged and confirm it shows there.
      await page.getByTestId('alerts-filter-ACKNOWLEDGED').click();
      await expect
        .poll(async () => page.locator('[data-testid^="alert-status-"]').first().textContent(), {
          timeout: 10_000,
        })
        .toContain('ACKNOWLEDGED');
    },
  );

  test(
    'alerts page requires authentication — redirects to /login',
    { tag: ['@alerts'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');
      await page.goto('/');
      await page.evaluate(() => {
        window.localStorage.removeItem('kpi-nexus.access-token');
        window.localStorage.removeItem('kpi-nexus.refresh-token');
      });
      await page.goto('/alerts');
      await expect(page).toHaveURL(/\/login$/);
    },
  );
});
