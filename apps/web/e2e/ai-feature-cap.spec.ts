/**
 * Plan 6.12: a feature's own cap was stored and never read, and the page had no
 * field for it. It is a daily cap now: set from the routing table, and once the
 * feature has spent it the feature is refused for the rest of the day.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface Config { feature: string; provider: string; model: string; perFeatureCapUsd?: number; fallback?: { provider: string; model: string } }

test("AI settings: a feature's daily cap is set from the routing table and kept with its fallback", async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cap-${stamp}`,
      slug: `cap-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cap.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const read = async () => ((await (await api.get('/ai/configs')).json()) as Config[]).find((c) => c.feature === 'NLQ_PRIMARY')!;
  const before = await read();

  // A row that already has a fallback of its own.
  const put = await api.put('/ai/configs/NLQ_PRIMARY', {
    data: { providerId: before.provider, model: before.model, fallbackProviderId: 'OLLAMA', fallbackModel: 'llama3' },
  });
  expect(put.ok()).toBeTruthy();

  await page.goto('/settings/ai');
  const cap = page.getByTestId('ai-config-NLQ_PRIMARY-cap');
  await expect(cap).toHaveValue('');

  // Not a number: cannot be saved.
  await cap.fill('lots');
  await expect(page.getByTestId('ai-config-NLQ_PRIMARY-save')).toBeDisabled();

  await cap.fill('0.25');
  await page.getByTestId('ai-config-NLQ_PRIMARY-save').click();
  await expect(page.getByTestId('ai-settings-success')).toContainText('up to $0.25 a day');
  const after = await read();
  expect(after.perFeatureCapUsd).toBe(0.25);
  // Saving the cap did not wipe the fallback.
  expect(after.fallback).toEqual({ provider: 'OLLAMA', model: 'llama3' });

  // Cleared again: no cap.
  await cap.fill('');
  await page.getByTestId('ai-config-NLQ_PRIMARY-save').click();
  await expect.poll(async () => (await read()).perFeatureCapUsd ?? null).toBeNull();
});
