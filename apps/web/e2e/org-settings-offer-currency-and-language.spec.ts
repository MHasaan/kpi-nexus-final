/**
 * Flow walk (settings): the setup wizard offers the currency and the language
 * as lists ("PKR — Pakistani Rupee"). Settings → Organization asked for the
 * same two as text to be typed from memory: "PKR", "en-US". It now offers the
 * same lists.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('organisation settings offer the currency and the language as lists', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `osl-${stamp}`,
      slug: `osl-${stamp}`,
      adminFullName: 'Osman Admin',
      adminEmail: `admin-${stamp}@osl.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });

  await page.goto('/settings/organization');
  const currency = page.getByTestId('org-currency');
  const language = page.getByTestId('org-locale');
  await expect(currency).toHaveValue('USD');
  await expect(currency.locator('option', { hasText: 'PKR — Pakistani Rupee' })).toHaveCount(1);
  await expect(language.locator('option', { hasText: 'English (United Kingdom)' })).toHaveCount(1);

  await currency.selectOption('PKR');
  await language.selectOption('en-GB');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect.poll(async () => ((await (await api.get('/organizations/me')).json()) as { currency: string; locale: string })).toMatchObject({ currency: 'PKR', locale: 'en-GB' });

  await page.reload();
  await expect(page.getByTestId('org-currency')).toHaveValue('PKR');
  await expect(page.getByTestId('org-locale')).toHaveValue('en-GB');
});
