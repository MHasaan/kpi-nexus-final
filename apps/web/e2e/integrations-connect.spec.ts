/**
 * Plan 6.10 / UI-015: "Connect" on the Integrations page stored a connection
 * with no credentials and called it connected, for every card. Slack and Jira
 * now have real forms; the other cards lead to the page that sets them up.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('integrations: Slack needs a workspace ID, Jira gives its webhook address once, the rest are links', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `itg-${stamp}`,
      slug: `itg-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@itg.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const list = async () => (await (await api.get('/integrations')).json()) as Array<{ id: string; provider: string; status: string; metadata: { team_id?: string } | null }>;
  // A workspace ID nobody else in this database has used.
  const teamId = `T${Date.now().toString(36).toUpperCase()}`;

  // The API refuses a provider with nothing behind it, and Slack with no workspace.
  expect((await api.post('/integrations', { data: { provider: 'teams' } })).status()).toBe(400);
  expect((await api.post('/integrations', { data: { provider: 'slack' } })).status()).toBe(400);
  expect(await list()).toEqual([]);

  await page.goto('/integrations');
  // Cards that are set up elsewhere are links, with no connected / not connected badge.
  await expect(page.getByTestId('integration-link-teams')).toHaveAttribute('href', '/alerts/channels');
  await expect(page.getByTestId('integration-link-webhooks')).toHaveAttribute('href', '/settings/webhooks');
  await expect(page.getByTestId('integration-link-apikeys')).toHaveAttribute('href', '/settings/api-keys');
  await expect(page.getByTestId('integration-status-teams')).toHaveCount(0);

  // Slack: a form, checked before it is sent.
  await expect(page.getByTestId('integration-status-slack')).toHaveText('Not connected');
  await page.getByTestId('connect-slack').click();
  await page.getByTestId('slack-team-id').fill('my workspace');
  await page.getByTestId('slack-connect-submit').click();
  await expect(page.getByTestId('slack-form-error')).toContainText('starts with T');
  await page.getByTestId('slack-team-id').fill(teamId);
  await page.getByTestId('slack-connect-submit').click();
  // Stored, and honestly "waiting": Slack has not been heard from.
  await expect(page.getByTestId('integration-status-slack')).toHaveText('Waiting for Slack');
  await expect(page.getByTestId('slack-commands-url')).toHaveText(`${API_URL}/integrations/slack/commands`);
  await expect(page.getByTestId('slack-interactive-url')).toHaveText(`${API_URL}/integrations/slack/interactive`);
  expect((await list()).find((c) => c.provider === 'slack')).toMatchObject({ status: 'PENDING', metadata: { team_id: teamId } });

  // Jira: the webhook address with its secret, once.
  await page.getByTestId('connect-jira').click();
  const address = await page.getByTestId('jira-webhook-url').innerText();
  const jira = (await list()).find((c) => c.provider === 'jira')!;
  expect(address).toMatch(new RegExp(`^${API_URL}/integrations/jira/webhook/${jira.id}\\?secret=[A-Za-z0-9_-]{32,}$`));
  await expect(page.getByTestId('integration-status-jira')).toHaveText('Waiting for Jira');
  await page.getByTestId('jira-secret-dismiss').click();
  await expect(page.getByTestId('jira-secret')).toHaveCount(0);

  // The address works: Jira calling it is accepted, and the connection becomes "Connected".
  const anon = await request.newContext();
  const delivered = await anon.post(address, { data: { issue: { key: `NONE-${stamp}`, fields: { status: { name: 'Done' } } } } });
  expect(delivered.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('integration-status-jira')).toHaveText('Connected');

  // A new secret: the old address is refused from then on.
  await page.getByTestId('jira-rotate').click();
  await page.getByTestId('jira-rotate-confirm-confirm').click();
  await expect(page.getByTestId('jira-webhook-url')).not.toHaveText(address);
  expect((await anon.post(address, { data: { issue: { key: 'X-1', fields: { status: { name: 'Done' } } } } })).status()).toBe(401);

  // Disconnect Slack.
  await page.getByTestId('disconnect-slack').click();
  await page.getByTestId('integration-disconnect-confirm-confirm').click();
  await expect(page.getByTestId('integration-status-slack')).toHaveText('Not connected');
});
