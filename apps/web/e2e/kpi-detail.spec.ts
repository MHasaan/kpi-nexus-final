/**
 * /kpis/[id] detail page (P2 FE). Browser e2e — registers via API, seeds the
 * session into localStorage, then drives the tabbed detail UI.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('kpi detail: tabs render; record data + add target via the UI', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `Detail E2E ${stamp}`,
        slug: `detail-${stamp}`,
        adminEmail: `admin-${stamp}@detail.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Detail Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Detail KPI ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' },
  })).json()) as { id: string };

  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );

  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('kpi-detail-name')).toContainText(`Detail KPI ${stamp}`);

  // Data tab: record a value, see it appear.
  await page.getByTestId('tab-data').click();
  await page.getByTestId('data-value').fill('42');
  await page.getByTestId('data-record').click();
  await expect(page.getByText('42', { exact: false }).first()).toBeVisible();

  // Targets tab: add a static target.
  await page.getByTestId('tab-targets').click();
  await page.getByTestId('target-value').fill('100');
  await page.getByTestId('target-add').click();
  await expect(page.getByText('STATIC 100')).toBeVisible();

  // Overview reflects the latest value.
  await page.getByTestId('tab-overview').click();
  await expect(page.getByTestId('overview-latest')).toContainText('42');
});
