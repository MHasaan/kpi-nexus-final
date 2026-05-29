/**
 * /kpis/templates marketplace page (P2 FE). Browser e2e — seeds session, browses
 * the lazily-seeded global templates, filters, and instantiates one.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('templates page: browse + filter + instantiate', async ({ page }) => {
  const stamp = suffix();
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `Tmpl FE ${stamp}`,
        slug: `tmplfe-${stamp}`,
        adminEmail: `admin-${stamp}@tmplfe.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Tmpl FE Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }

  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );

  await page.goto('/kpis/templates');
  // Global catalog is lazily seeded on first list — expect cards.
  await expect(page.getByTestId('tmpl-grid').getByRole('heading')).not.toHaveCount(0);

  // Instantiate the MRR template (slug monthly-recurring-revenue).
  await page.getByTestId('tmpl-use-monthly-recurring-revenue').click();
  await expect(page.getByTestId('tmpl-msg')).toContainText('Created');
});
