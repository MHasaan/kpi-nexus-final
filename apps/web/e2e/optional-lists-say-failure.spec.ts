/**
 * X-02 (remainder): a few pages load a list they can do without — KPIs for a
 * picker, a KPI's watch state — and, when that list failed, showed an empty
 * picker or "Watch" as if all were well. The failure is now said.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const fail = (route: import('@playwright/test').Route) =>
  route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Service unavailable' }) });

test('a list a page can do without still says when it failed to load', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `osf-${stamp}`,
      slug: `osf-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@osf.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const kpi = (await (await api.post('/kpis', { data: { name: `Margin ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string };
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };
  const objective = (await (await api.post('/objectives', {
    data: { name: `Grow ${stamp}`, ownerUserId: me.user.id, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'ACTIVE' },
  })).json()) as { id: string };

  // A KPI's watch state.
  await page.route(`**/kpis/${kpi.id}/watch`, fail);
  await page.goto(`/kpis/${kpi.id}`);
  await expect(page.getByTestId('watch-load-error')).toContainText('could not be loaded');
  await page.unroute(`**/kpis/${kpi.id}/watch`);

  // The KPI list behind pickers: only the list itself fails, not a KPI's own pages.
  const kpiList = (url: URL) => url.port === '4000' && url.pathname === '/kpis';
  await page.route(kpiList, fail);

  await page.goto('/workflows');
  await expect(page.getByTestId('wf-kpis-error')).toContainText('KPIs could not be loaded');

  await page.goto(`/okrs/${objective.id}`);
  await expect(page.getByTestId('objective-heading')).toBeVisible();
  await expect(page.getByTestId('okr-pickers-error')).toContainText('KPIs could not be loaded');

  await page.goto('/tasks');
  await expect(page.getByTestId('tasks-kpis-error')).toContainText('KPIs could not be loaded');

  // The new-report form cannot do without its lists: it says so and offers to try again.
  await page.goto('/reports/new');
  await expect(page.getByTestId('report-lists-error')).toContainText('could not be loaded');
  await page.unroute(kpiList);
  await page.getByTestId('report-lists-error').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('report-lists-error')).toHaveCount(0);

  // Access Center: the KPI categories behind its choices.
  await page.route((url) => url.port === '4000' && url.pathname === '/kpi-categories', fail);
  await page.goto('/settings/access');
  await expect(page.getByTestId('access-categories-error')).toContainText('KPI categories could not be loaded');
});
