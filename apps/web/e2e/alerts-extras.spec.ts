/**
 * P4 FE extras e2e: per-user notification settings, the DLQ view, and the
 * header alerts bell.
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
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — alerts-extras skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function registerOrg(stamp: string): Promise<Reg> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const res = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Extras E2E ${stamp}`,
      slug: `extras-${stamp}`,
      adminEmail: `admin-${stamp}@extras.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Extras Admin',
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

test.describe('P4 FE extras', () => {
  test('notification preferences save + persist', { tag: ['@extras'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    const reg = await registerOrg(suffix());
    await injectTokens(page, reg);

    await page.goto('/settings/notifications');
    await expect(page.getByTestId('notif-settings-heading')).toBeVisible();

    await page.getByTestId('digest-DAILY').check();
    await page.getByTestId('mute-kind-SMS').check();
    await page.getByTestId('notif-settings-save').click();
    await expect(page.getByTestId('notif-settings-saved')).toBeVisible({ timeout: 10_000 });

    // Reload → persisted.
    await page.reload();
    await expect(page.getByTestId('digest-DAILY')).toBeChecked();
    await expect(page.getByTestId('mute-kind-SMS')).toBeChecked();
  });

  test('DLQ view shows empty state for a fresh org', { tag: ['@extras'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    const reg = await registerOrg(suffix());
    await injectTokens(page, reg);

    await page.goto('/settings/notifications/dlq');
    await expect(page.getByTestId('dlq-heading')).toBeVisible();
    await expect(page.getByTestId('dlq-empty')).toBeVisible({ timeout: 10_000 });
  });

  test('header alerts bell shows count + acknowledges from dropdown', { tag: ['@extras'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.setTimeout(90_000);

    const stamp = suffix();
    const reg = await registerOrg(stamp);
    const apiCtx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
    });

    // Seed an alert via API.
    const kpi = (await (await apiCtx.post('/kpis', {
      data: { name: `Bell KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', unit: 'u', aggregationMethod: 'LAST' },
    })).json()) as { id: string };
    await apiCtx.post('/alert-rules', {
      data: { kpiId: kpi.id, name: 'High', ruleType: 'STATIC_THRESHOLD', severity: 'HIGH', config: { operator: '>', value: 100 } },
    });
    await apiCtx.post(`/kpis/${kpi.id}/data`, {
      data: { value: 150, periodStart: '2026-05-29T00:00:00.000Z', periodEnd: '2026-05-29T12:00:00.000Z' },
    });
    await expect
      .poll(async () => ((await (await apiCtx.get('/alerts?status=OPEN')).json()) as unknown[]).length, {
        timeout: 60_000,
        intervals: [1000, 1000, 2000, 3000],
      })
      .toBeGreaterThan(0);

    await injectTokens(page, reg);
    await page.goto('/dashboard');
    // Bell count badge appears (polls on mount).
    await expect(page.getByTestId('alerts-bell-count')).toBeVisible({ timeout: 15_000 });

    // Open the dropdown, acknowledge the alert.
    await page.getByTestId('alerts-bell').click();
    await expect(page.getByTestId('alerts-bell-dropdown')).toBeVisible();
    const ackBtn = page.locator('[data-testid^="alerts-bell-ack-"]').first();
    await expect(ackBtn).toBeVisible({ timeout: 10_000 });
    await ackBtn.click();

    // Count badge disappears once the only open alert is acknowledged.
    await expect(page.getByTestId('alerts-bell-count')).toBeHidden({ timeout: 10_000 });
  });
});
