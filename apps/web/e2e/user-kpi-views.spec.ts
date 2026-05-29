/**
 * My KPIs + /users/[id] + /team pages (P2 FE). Browser e2e — assigns a PER_USER
 * KPI to the admin, records inline, and views it from the per-user panel.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('my-kpis records inline; user panel + team render', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `UKV ${stamp}`,
        slug: `ukv-${stamp}`,
        adminEmail: `admin-${stamp}@ukv.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'UKV Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const me = ((await (await api.get('/auth/me')).json()) as { user: { id: string } }).user;
  const kpi = (await (await api.post('/kpis', {
    data: { name: `Self KPI ${stamp}`, scope: 'PER_USER', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST', userIds: [me.id] },
  })).json()) as { id: string };
  await api.post('/user-kpis/assign', { data: { userId: me.id, kpiId: kpi.id, targetValue: 100 } });

  await page.goto('/');
  await page.evaluate(([a, r]) => {
    window.localStorage.setItem('kpi-nexus.access-token', a);
    window.localStorage.setItem('kpi-nexus.refresh-token', r);
  }, [reg.accessToken, reg.refreshToken] as const);

  // My KPIs: record inline → current value updates.
  await page.goto('/my-kpis');
  await expect(page.getByText(`Self KPI ${stamp}`)).toBeVisible();
  await page.getByTestId(`mykpi-value-${kpi.id}`).fill('95');
  await page.getByTestId(`mykpi-record-${kpi.id}`).click();
  await expect(page.getByText('Current: 95', { exact: false })).toBeVisible();

  // Per-user panel shows it.
  await page.goto(`/users/${me.id}`);
  await expect(page.getByTestId('user-kpis-list').getByText(`Self KPI ${stamp}`)).toBeVisible();

  // Team page renders (admin has no reports → empty state).
  await page.goto('/team');
  await expect(page.getByTestId('team-empty')).toBeVisible();
});
