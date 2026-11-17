/**
 * Plan 6.14: small settings. Copy buttons said nothing after a press; a SCIM
 * token could not be copied or put away and the page did not give the address
 * to paste at the identity provider; rotating a webhook secret happened at
 * once; an API key did not show when it was last used.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('small settings: copy says it copied, rotate asks first, SCIM shows its address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `sml-${stamp}`,
      slug: `sml-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@sml.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const { events } = (await (await api.get('/webhooks/events')).json()) as { events: string[] };
  const hook = (await (await api.post('/webhooks', { data: { name: `Hook ${stamp}`, url: 'https://example.com/hook', events: [events[0]] } })).json()) as {
    webhook: { id: string };
  };

  // API keys: the copy button says it copied, and the table says when a key was last used.
  await page.goto('/settings/api-keys');
  await page.getByTestId('apikey-name-input').fill(`Key ${stamp}`);
  await page.getByTestId('apikey-create-form').locator('input[type="checkbox"]').first().check();
  await page.getByTestId('apikey-create-submit').click();
  const keyCopy = page.getByTestId('apikey-plaintext').getByTestId('copy-button');
  await keyCopy.click();
  await expect(keyCopy).toHaveText('Copied');
  await expect(page.getByTestId('apikeys-table')).toContainText('Last used');
  await expect(page.getByTestId('apikeys-table')).toContainText('Never');

  // Webhooks: rotating asks first; cancelling changes nothing.
  await page.goto('/settings/webhooks');
  await page.getByTestId(`webhook-rotate-${hook.webhook.id}`).click();
  await expect(page.getByTestId('webhook-rotate-confirm')).toContainText('stops working');
  await page.getByTestId('webhook-rotate-confirm').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('webhook-secret')).toHaveCount(0);
  await page.getByTestId(`webhook-rotate-${hook.webhook.id}`).click();
  await page.getByTestId('webhook-rotate-confirm-confirm').click();
  const secretCopy = page.getByTestId('webhook-secret').getByTestId('copy-button');
  await secretCopy.click();
  await expect(secretCopy).toHaveText('Copied');

  // SCIM: the address to give the identity provider, and a token that can be copied and put away.
  await page.goto('/settings/scim');
  await expect(page.getByTestId('scim-base-url')).toContainText(`${API_URL}/scim/v2`);
  await page.getByTestId('scim-label').fill(`Okta ${stamp}`);
  await page.getByTestId('scim-mint').click();
  const token = await page.getByTestId('scim-token-value').innerText();
  await page.getByTestId('scim-minted').getByTestId('copy-button').click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(token);
  await page.getByTestId('scim-minted-dismiss').click();
  await expect(page.getByTestId('scim-minted')).toHaveCount(0);
});
