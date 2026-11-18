/**
 * Plan 7.7 (cascade): the Cascade tab attached every child as a plain sum and
 * offered no way to choose how the children add up or what each one weighs.
 * The method belongs to the parent — the engine reads one method for all of a
 * parent's children — so choosing it sets it on every child.
 */
import { expect, request, test } from '@playwright/test';

import { registerOrgViaApi } from './helpers/org';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('cascade: choose how children add up, and what each weighs', async ({ page }) => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let session: { accessToken: string };
  try {
    session = await registerOrgViaApi(page, {
      orgName: `cmw-${stamp}`,
      slug: `cmw-${stamp}`,
      adminFullName: 'Ada Admin',
      adminEmail: `admin-${stamp}@cmw.test.local`,
      adminPassword: 'correct-horse-battery-staple',
    });
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  const api = await request.newContext({ baseURL: API_URL, extraHTTPHeaders: { authorization: `Bearer ${session.accessToken}` } });
  const make = async (name: string) => ((await (await api.post('/kpis', { data: { name, scope: 'ORG_WIDE' } })).json()) as { id: string }).id;
  const parent = await make(`Total ${stamp}`);
  const a = await make(`A ${stamp}`);
  const b = await make(`B ${stamp}`);
  const today = new Date().toISOString().slice(0, 10);
  for (const [id, value] of [[a, 10], [b, 20]] as const) {
    expect((await api.post(`/kpis/${id}/data`, { data: { value, periodStart: `${today.slice(0, 8)}01`, periodEnd: today } })).status()).toBe(201);
  }
  const edges = async () =>
    ((await (await api.get('/kpi-cascades')).json()) as Array<{ parentKpiId: string; childKpiId: string; method: string; weight: number }>).filter((e) => e.parentKpiId === parent);

  await page.goto(`/kpis/${parent}?tab=cascade`);

  // Attach both children from the page; with nothing chosen they add up as a sum.
  for (const id of [a, b]) {
    await page.getByTestId('cascade-child').selectOption(id);
    await page.getByTestId('cascade-add').click();
    await expect(page.getByTestId(`cascade-child-row-${id}`)).toBeVisible();
  }
  await expect(page.getByTestId('cascade-method')).toHaveValue('SUM');
  // A weight means nothing in a sum, so none is offered.
  await expect(page.getByTestId(`cascade-weight-${b}`)).toHaveCount(0);

  // Choose a weighted average: it applies to every child of this KPI.
  await page.getByTestId('cascade-method').selectOption('WEIGHTED_AVG');
  await expect.poll(async () => (await edges()).map((e) => e.method).sort()).toEqual(['WEIGHTED_AVG', 'WEIGHTED_AVG']);

  // Give B three times the weight of A.
  const weight = page.getByTestId(`cascade-weight-${b}`);
  await weight.fill('3');
  await weight.blur();
  await expect.poll(async () => (await edges()).find((e) => e.childKpiId === b)?.weight).toBe(3);

  // A child attached later takes the parent's method, not a sum.
  const c = await make(`C ${stamp}`);
  expect((await api.post('/kpi-cascades', { data: { parentKpiId: parent, childKpiId: c } })).status()).toBe(201);
  expect((await edges()).find((e) => e.childKpiId === c)?.method).toBe('WEIGHTED_AVG');
  expect((await api.delete(`/kpi-cascades/${((await (await api.get('/kpi-cascades')).json()) as Array<{ id: string; childKpiId: string }>).find((e) => e.childKpiId === c)!.id}`)).status()).toBe(204);

  // And the roll-up uses them: (10×1 + 20×3) / 4.
  const rolled = (await (await api.post(`/kpis/${parent}/rollup`, { data: {} })).json()) as { value: number | null };
  expect(rolled.value).toBeCloseTo(17.5);

  // Reloaded, the page shows what was saved.
  await page.reload();
  await expect(page.getByTestId('cascade-method')).toHaveValue('WEIGHTED_AVG');
  await expect(page.getByTestId(`cascade-weight-${b}`)).toHaveValue('3');
});
