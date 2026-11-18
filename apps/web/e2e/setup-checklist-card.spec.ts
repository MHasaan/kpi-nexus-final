/**
 * Plan 3.11: the "Finish setting up" card on the dashboard listed tasks as
 * plain text with nowhere to go, swallowed every failure, and only ever showed
 * what had been ticked by hand.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function start(page: import('@playwright/test').Page, tag: string) {
  const stamp = suffix();
  const session = await registerOrgViaApi(page, {
    orgName: `${tag}-${stamp}`,
    slug: `${tag}-${stamp}`,
    adminFullName: 'Checklist Admin',
    adminEmail: `admin-${stamp}@${tag}.test.local`,
    adminPassword: 'correct-horse-battery-staple',
  });
  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` },
  });
  return { api, stamp };
}

test('checklist card: each task links to where it is done, and done work shows as done', async ({ page }) => {
  let ctx: Awaited<ReturnType<typeof start>>;
  try {
    ctx = await start(page, 'clcard');
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const card = page.getByTestId('setup-checklist-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId('checklist-progress')).toHaveText('0 of 13 complete');

  // A task is a link to the page where it is done.
  await expect(card.getByTestId('checklist-remaining_invites').getByRole('link', { name: 'Invite your team' })).toHaveAttribute('href', '/users');
  await expect(card.getByTestId('checklist-channels').getByRole('link')).toHaveAttribute('href', '/alerts/channels');

  // Invite someone — nothing is ticked by hand.
  expect((await ctx.api.post('/users', { data: { email: `mate-${ctx.stamp}@clcard.test.local`, fullName: 'Team Mate' } })).status()).toBe(201);
  await page.reload();
  await expect(card.getByTestId('checklist-progress')).toHaveText('1 of 13 complete');
  await expect(card.getByTestId('checklist-remaining_invites')).toHaveCount(0);
  await card.getByTestId('checklist-toggle-done').click();
  const done = card.getByTestId('checklist-done-remaining_invites');
  await expect(done).toContainText('Invite your team');
  // Work that exists cannot be "undone" from here.
  await expect(done.getByRole('button', { name: /undo/i })).toHaveCount(0);

  // Ticking one by hand still works, and can be undone.
  await card.getByTestId('checklist-compliance_review-complete').click();
  await expect(card.getByTestId('checklist-progress')).toHaveText('2 of 13 complete');
  await card.getByTestId('checklist-done-compliance_review').getByRole('button', { name: /undo/i }).click();
  await expect(card.getByTestId('checklist-progress')).toHaveText('1 of 13 complete');
});

test('checklist card: a failed load or action is shown, not swallowed', async ({ page }) => {
  try {
    await start(page, 'clerr');
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await expect(page.getByTestId('setup-checklist-card')).toBeVisible({ timeout: 15_000 });

  // An action that fails says so and leaves the task where it was.
  await page.route('**/setup-checklist/*/complete', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'INTERNAL', message: 'Could not save that' }) }),
  );
  await page.getByTestId('checklist-compliance_review-complete').click();
  await expect(page.getByTestId('checklist-error')).toContainText('Could not save that');
  await expect(page.getByTestId('checklist-compliance_review')).toBeVisible();
  await page.unroute('**/setup-checklist/*/complete');

  // A load that fails shows a way to try again instead of an empty dashboard corner.
  let fail = true;
  await page.route('**/setup-checklist', (route) => (fail ? route.abort() : route.continue()));
  await page.reload();
  const problem = page.getByTestId('checklist-load-error');
  await expect(problem).toBeVisible({ timeout: 15_000 });
  fail = false;
  await problem.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('setup-checklist-card')).toBeVisible();
});
