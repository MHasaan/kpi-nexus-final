/**
 * Plan 6.12: the API stored a fallback provider and model per feature, but the
 * routing table had no way to choose one.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Config { feature: string; fallback?: { provider: string; model: string } }

test("AI settings: a feature's fallback provider and model are chosen in the routing table", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `afb-${stamp}`,
      slug: `afb-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@afb.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const read = async () => ((await (await api.get('/ai/configs')).json()) as Config[]).find((c) => c.feature === 'NLQ_PRIMARY')!;

  await page.goto('/settings/ai');
  const provider = page.getByTestId('ai-config-NLQ_PRIMARY-fallback-provider');
  const save = page.getByTestId('ai-config-NLQ_PRIMARY-save');
  await expect(provider).toHaveValue('');

  // A provider without a model cannot be saved.
  await provider.selectOption('OLLAMA');
  await expect(save).toBeDisabled();
  await page.getByTestId('ai-config-NLQ_PRIMARY-fallback-model').fill('llama3');
  await save.click();
  await expect(page.getByTestId('ai-settings-success')).toBeVisible();
  await expect.poll(async () => (await read()).fallback).toEqual({ provider: 'OLLAMA', model: 'llama3' });

  // Back to the built-in fallback.
  await provider.selectOption('');
  await save.click();
  await expect.poll(async () => (await read()).fallback ?? null).toBeNull();
});
