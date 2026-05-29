/**
 * /kpis/archive page (P2 FE). Browser e2e — soft-deletes a KPI, restores it,
 * then purges another. Requires the api at $API_URL.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('archive page: restore + purge soft-deleted KPIs', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `Arch FE ${stamp}`,
        slug: `archfe-${stamp}`,
        adminEmail: `admin-${stamp}@archfe.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Arch Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` } });
  const mk = async (name: string) => ((await (await api.post('/kpis', { data: { name, scope: 'ORG_WIDE', type: 'NUMBER', direction: 'HIGHER_IS_BETTER', aggregationMethod: 'LAST' } })).json()) as { id: string }).id;
  const toRestore = await mk(`Restore Me ${stamp}`);
  const toPurge = await mk(`Purge Me ${stamp}`);
  await api.delete(`/kpis/${toRestore}`); // soft-delete
  await api.delete(`/kpis/${toPurge}`);

  await page.goto('/');
  await page.evaluate(([a, r]) => {
    window.localStorage.setItem('kpi-nexus.access-token', a);
    window.localStorage.setItem('kpi-nexus.refresh-token', r);
  }, [reg.accessToken, reg.refreshToken] as const);

  await page.goto('/kpis/archive');
  await expect(page.getByText(`Restore Me ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Purge Me ${stamp}`)).toBeVisible();

  // Restore one → disappears from archive.
  await page.getByTestId(`restore-${toRestore}`).click();
  await expect(page.getByText(`Restore Me ${stamp}`)).toHaveCount(0);

  // Purge the other (accept the confirm dialog) → disappears.
  page.on('dialog', (d) => d.accept());
  await page.getByTestId(`purge-${toPurge}`).click();
  await expect(page.getByText(`Purge Me ${stamp}`)).toHaveCount(0);
});
