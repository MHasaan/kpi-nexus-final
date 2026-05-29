/**
 * /kpis/scorecard BSC grid (P2 FE). Browser e2e — creates KPIs in two quadrants,
 * records values, verifies they land in the right quadrant cards.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('scorecard groups KPIs by BSC quadrant', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `SC FE ${stamp}`,
        slug: `scfe-${stamp}`,
        adminEmail: `admin-${stamp}@scfe.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'SC Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const fin = (await (await api.post('/kpis', { data: { name: `Revenue ${stamp}`, scope: 'ORG_WIDE', type: 'CURRENCY', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', scorecardQuadrant: 'FINANCIAL' } })).json()) as { id: string };
  await api.post('/kpis', { data: { name: `NPS ${stamp}`, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', scorecardQuadrant: 'CUSTOMER' } });
  await api.post(`/kpis/${fin.id}/data`, { data: { value: 5000, periodStart: '2026-05-01T00:00:00.000Z', periodEnd: '2026-05-01T01:00:00.000Z' } });

  await page.goto('/');
  await page.evaluate(([a, r]) => {
    window.localStorage.setItem('kpi-nexus.access-token', a);
    window.localStorage.setItem('kpi-nexus.refresh-token', r);
  }, [reg.accessToken, reg.refreshToken] as const);

  await page.goto('/kpis/scorecard');
  await expect(page.getByTestId('quadrant-FINANCIAL').getByText(`Revenue ${stamp}`)).toBeVisible();
  await expect(page.getByTestId('quadrant-CUSTOMER').getByText(`NPS ${stamp}`)).toBeVisible();
});
