/**
 * Plan 6.10 (connectors): a connector could not be changed after it was made,
 * and "Run now" said only a status word — not how many values came in, nor why
 * a run failed. The run history said no more.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('connector: edit it in place; a run says what it did, and the history keeps the reason for a failure', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cer-${stamp}`,
      slug: `cer-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cer.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const make = async (name: string) => ((await (await api.post('/kpis', { data: { name: `${name} ${stamp}`, scope: 'ORG_WIDE' } })).json()) as { id: string }).id;
  const kpiA = await make('Stars');
  const kpiB = await make('Forks');
  // An address that resolves nowhere: the run fails for a reason the page can show, without the network.
  const created = (await (await api.post('/connectors', {
    data: { name: `Repo ${stamp}`, type: 'REST', config: { url: 'https://connector-test.invalid/data', valuePath: 'count', kpiId: kpiA } },
  })).json()) as { id: string };
  const read = async () => (await (await api.get(`/connectors/${created.id}`)).json()) as { name: string; schedule: string | null; isActive: boolean; config: { url: string; valuePath: string; kpiId: string } };

  await page.goto(`/connectors/${created.id}`);
  await expect(page.getByTestId('connector-heading')).toHaveText(`Repo ${stamp}`);
  // What it does is said in words, not as raw JSON only.
  await expect(page.getByTestId('connector-summary')).toContainText(`Stars ${stamp}`);
  await expect(page.getByTestId('connector-summary')).toContainText('count');

  // Edit: a schedule that is not a schedule is refused, naming the field.
  await page.getByTestId('connector-edit').click();
  const form = page.getByTestId('connector-edit-form');
  await form.getByLabel('Schedule').fill('every morning');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('connector-edit-error')).toContainText(/schedule/i);

  // A real change: name, value path, the KPI it records on, a daily schedule, and paused.
  await form.getByLabel('Name').fill(`Repo forks ${stamp}`);
  await form.getByLabel('Value path').fill('forks_count');
  await form.getByLabel('KPI').selectOption(kpiB);
  await form.getByLabel('Schedule').fill('0 8 * * *');
  await form.getByLabel('Active').uncheck();
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('connector-heading')).toHaveText(`Repo forks ${stamp}`);
  expect(await read()).toMatchObject({
    name: `Repo forks ${stamp}`,
    schedule: '0 8 * * *',
    isActive: false,
    config: { url: 'https://connector-test.invalid/data', valuePath: 'forks_count', kpiId: kpiB },
  });
  await expect(page.getByTestId('connector-summary')).toContainText('Paused');

  // Run it: the page says it failed and why, and the history row keeps the reason.
  await page.getByTestId('connector-run').click();
  const result = page.getByTestId('connector-run-result');
  await expect(result).toContainText('failed');
  const reason = (await result.textContent()) ?? '';
  expect(reason.length).toBeGreaterThan('The run failed'.length + 5);
  const row = page.getByTestId('run-history').locator('[data-testid^="run-row-"]').first();
  await expect(row).toContainText('Failed');
  await expect(row.getByTestId('run-error')).not.toBeEmpty();
});
