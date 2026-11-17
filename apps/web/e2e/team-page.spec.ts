/**
 * Plan 2.12: /team lists the people who report to you. Until a manager could
 * be set (UI-010) it was empty in every real organisation, and its empty state
 * carried the list's own test id, so "nothing here" and "here they are" looked
 * the same to anything checking the page.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('my team shows the people who report to me, with their KPIs', async ({ page }) => {
  const stamp = suffix();
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `team-${stamp}`,
      slug: `team-${stamp}`,
      adminFullName: 'Team Lead',
      adminEmail: `lead-${stamp}@team.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });
  const me = (await (await api.get('/auth/me')).json()) as { user: { id: string } };

  // Nobody reports to me yet: an empty state that says how to change that.
  await page.goto('/team');
  const empty = page.getByTestId('team-empty');
  await expect(empty).toBeVisible();
  await expect(page.getByTestId('team-list')).toHaveCount(0);
  await expect(empty.getByRole('link', { name: 'Go to People' })).toHaveAttribute('href', '/users');

  const invite = async (name: string, managerId?: string) =>
    ((await (await api.post('/users', {
      data: { email: `${name.toLowerCase().replace(/\s+/g, '.')}-${stamp}@team.test.local`, fullName: name, ...(managerId ? { managerId } : {}) },
    })).json()) as { user: { id: string } }).user.id;
  const rae = await invite('Rae Report', me.user.id);
  const noKpis = await invite('Nora Newhire', me.user.id);
  const elsewhere = await invite('Otto Other');
  await api.post('/kpis', {
    data: {
      name: `Calls Made ${stamp}`,
      scope: 'PER_USER',
      type: 'NUMBER',
      direction: 'HIGHER_IS_BETTER',
      aggregationMethod: 'LAST',
      userIds: [rae, elsewhere],
    },
  });

  await page.reload();
  const list = page.getByTestId('team-list');
  await expect(list).toBeVisible();
  await expect(page.getByTestId('team-empty')).toHaveCount(0);

  const raeCard = list.getByTestId(`team-member-${rae}`);
  await expect(raeCard).toContainText('Rae Report');
  await expect(raeCard).toContainText(`Calls Made ${stamp}`);
  await expect(raeCard.getByRole('link', { name: 'Rae Report' })).toHaveAttribute('href', `/users/${rae}`);
  // A report with nothing assigned still appears, and says so.
  await expect(list.getByTestId(`team-member-${noKpis}`)).toContainText('No KPIs assigned');
  // Someone who reports to nobody is not on my team.
  await expect(list.getByTestId(`team-member-${elsewhere}`)).toHaveCount(0);
});
