/**
 * /kpis/tree cascade tree page (P2 FE). Browser e2e — builds a parent→child
 * cascade via API, then verifies the tree renders both.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('cascade tree page renders parents + children', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `Tree FE ${stamp}`,
        slug: `treefe-${stamp}`,
        adminEmail: `admin-${stamp}@treefe.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Tree Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const mk = async (name: string) => ((await (await api.post('/kpis', { data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'SUM' } })).json()) as { id: string }).id;
  const parent = await mk(`Total ${stamp}`);
  const child = await mk(`Child ${stamp}`);
  await api.post('/kpi-cascades', { data: { parentKpiId: parent, childKpiId: child, method: 'SUM' } });

  await page.goto('/');
  await page.evaluate(([a, r]) => {
    window.localStorage.setItem('kpi-nexus.access-token', a);
    window.localStorage.setItem('kpi-nexus.refresh-token', r);
  }, [reg.accessToken, reg.refreshToken] as const);

  await page.goto('/kpis/tree');
  await expect(page.getByText(`Total ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Child ${stamp}`)).toBeVisible();
});
