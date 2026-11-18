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
  // Flow walk, 2026-11-18: the value used to be saved for "now to now" — an instant — whatever the
  // KPI's frequency, and nothing said which period it was for. A monthly KPI records for this month.
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDay = String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0');
  await expect(page.getByTestId(`mykpi-${kpi.id}-period-start`)).toHaveValue(`${month}-01`);
  await expect(page.getByTestId(`mykpi-${kpi.id}-period-end`)).toHaveValue(`${month}-${lastDay}`);
  await page.getByTestId(`mykpi-${kpi.id}-value`).fill('95');
  await page.getByTestId(`mykpi-${kpi.id}-record`).click();
  await expect(page.getByTestId(`mykpi-current-${kpi.id}`)).toHaveText('95');
  const points = (await (await api.get('/user-kpis/my-kpis')).json()) as Array<{ kpiId: string; currentValue: number | null; frequency: string }>;
  expect(points.find((p) => p.kpiId === kpi.id)).toMatchObject({ currentValue: 95, frequency: 'MONTHLY' });
  const saved = (await (await api.get(`/kpis/${kpi.id}/data`)).json()) as Array<{ value: number; periodStart: string; periodEnd: string }>;
  expect(saved).toHaveLength(1);
  expect(saved[0]!.periodStart.slice(0, 10)).toBe(`${month}-01`);
  expect(saved[0]!.periodEnd.slice(0, 10)).toBe(`${month}-${lastDay}`);

  // Per-user panel shows it.
  await page.goto(`/users/${me.id}`);
  await expect(page.getByTestId('user-kpis-list').getByText(`Self KPI ${stamp}`)).toBeVisible();

  // Team page renders (admin has no reports → empty state).
  await page.goto('/team');
  await expect(page.getByTestId('team-empty')).toBeVisible();
});
