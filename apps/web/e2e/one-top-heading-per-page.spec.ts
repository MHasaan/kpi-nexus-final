/**
 * Flow walk: every page had two top-level headings — its own, and the page's
 * name in the top bar marked up as a heading too. Four pages had a third,
 * hidden one. A screen reader's list of headings named each page twice or
 * three times. A page now has one.
 */
import { expect, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

test('a page has one top-level heading', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await registerOrgViaApi(page, {
      orgName: `oth-${stamp}`,
      slug: `oth-${stamp}`,
      adminFullName: 'Otis Admin',
      adminEmail: `admin-${stamp}@oth.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.addInitScript(() => window.localStorage.setItem('kpi-nexus.tour-completed', '1'));

  for (const path of [
    '/dashboard', '/kpis', '/kpis/new', '/dashboards', '/alerts', '/alerts/channels', '/alerts/rules', '/tasks', '/okrs',
    '/reports', '/users', '/org-units', '/roles', '/positions', '/settings', '/settings/organization',
    '/settings/notifications', '/settings/notifications/dlq', '/profile', '/ask', '/activity', '/billing',
  ]) {
    await page.goto(path);
    const headings = page.locator('h1');
    await expect(headings.first(), `${path} has a heading`).toBeVisible({ timeout: 15_000 });
    await expect(headings, `${path} has one top-level heading`).toHaveCount(1);
    // The top bar still says where you are.
    await expect(page.getByRole('banner').getByTestId('top-bar-title'), `${path} is named in the top bar`).not.toBeEmpty();
  }
});
