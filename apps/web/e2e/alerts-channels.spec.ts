/**
 * Alerts channels + detail e2e.
 *  - Create an EMAIL notification channel via the UI → appears in the table →
 *    "Test" sends (Mailhog/dev log) → delete removes it.
 *  - Open an alert's detail page and acknowledge from there.
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
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — alerts-channels skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function registerOrg(stamp: string): Promise<Reg> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const res = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Channels E2E ${stamp}`,
      slug: `channels-${stamp}`,
      adminEmail: `admin-${stamp}@channels.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Channels Admin',
    },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<Reg>;
}

async function injectTokens(page: import('@playwright/test').Page, reg: Reg): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('Notification channels UI', () => {
  test(
    'create EMAIL channel → appears → test → delete',
    { tag: ['@channels'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');
      test.setTimeout(60_000);

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      await injectTokens(page, reg);

      await page.goto('/alerts/channels');
      await expect(page.getByTestId('channels-heading')).toBeVisible();
      await expect(page.getByTestId('channels-empty')).toBeVisible();

      // Create an EMAIL channel.
      await page.getByTestId('channel-name-input').fill(`Ops Email ${stamp}`);
      await page.getByTestId('channel-kind-select').selectOption('EMAIL');
      await page.getByTestId('channel-recipients-input').fill(`ops-${stamp}@channels.test.local`);

      const createResp = page.waitForResponse(
        (r) => r.url().includes('/notification-channels') && r.request().method() === 'POST',
      );
      await page.getByTestId('channel-create-submit').click();
      expect((await createResp).status()).toBe(201);

      // Row appears.
      const row = page.locator('[data-testid^="channel-row-"]').first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row).toContainText('EMAIL');

      // Test it → success status message.
      const testBtn = row.locator('[data-testid^="channel-test-"]');
      await testBtn.click();
      await expect(page.getByTestId('channel-test-msg')).toBeVisible({ timeout: 10_000 });

      // Delete it → table empties.
      const delBtn = row.locator('[data-testid^="channel-delete-"]');
      await delBtn.click();
      await expect(page.getByTestId('channels-empty')).toBeVisible({ timeout: 10_000 });
    },
  );

  test(
    'alert detail page shows the alert and acknowledges',
    { tag: ['@channels'] },
    async ({ page }) => {
      test.skip(!apiAvailable, 'api not reachable');
      test.setTimeout(90_000);

      const stamp = suffix();
      const reg = await registerOrg(stamp);
      const apiCtx = await request.newContext({
        baseURL: API_URL,
        extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
      });

      // Seed a KPI + rule + breach entirely via API, then assert the detail UI.
      const kpi = (await (await apiCtx.post('/kpis', {
        data: { name: `Detail KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', unit: 'u', aggregationMethod: 'LAST' },
      })).json()) as { id: string };
      await apiCtx.post('/alert-rules', {
        data: { kpiId: kpi.id, name: 'High', ruleType: 'STATIC_THRESHOLD', severity: 'HIGH', config: { operator: '>', value: 100 } },
      });
      await apiCtx.post(`/kpis/${kpi.id}/data`, {
        data: { value: 150, periodStart: '2026-05-29T00:00:00.000Z', periodEnd: '2026-05-29T12:00:00.000Z' },
      });

      // Wait (API truth) for the alert, grab its id.
      let alertId = '';
      await expect
        .poll(async () => {
          const list = (await (await apiCtx.get('/alerts?status=OPEN')).json()) as Array<{ id: string }>;
          if (list.length > 0 && list[0]) alertId = list[0].id;
          return list.length;
        }, { timeout: 60_000, intervals: [1000, 1000, 2000, 3000] })
        .toBeGreaterThan(0);

      await injectTokens(page, reg);
      await page.goto(`/alerts/${alertId}`);
      await expect(page.getByTestId('alert-detail-message')).toContainText('150');
      await expect(page.getByTestId('alert-detail-status')).toContainText('OPEN');

      await page.getByTestId('alert-detail-ack').click();
      await expect(page.getByTestId('alert-detail-status')).toContainText('ACKNOWLEDGED', { timeout: 10_000 });
    },
  );
});
