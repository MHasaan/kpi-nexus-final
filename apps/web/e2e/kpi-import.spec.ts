/**
 * KPI bulk CSV import e2e (P2).
 *  - Bad CSV → dry-run shows errors, commit stays disabled.
 *  - Good CSV → dry-run 0 errors → commit → success → KPIs exist via API.
 *
 * Requires the api at $API_URL (default http://localhost:4000).
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

async function isApiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

let apiAvailable = false;
test.beforeAll(async () => {
  apiAvailable = await isApiUp();
  if (!apiAvailable) console.warn(`[skip] api not reachable at ${API_URL} — kpi-import skipped`);
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface Reg { accessToken: string; refreshToken: string }

async function registerOrg(stamp: string): Promise<Reg> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const res = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Import E2E ${stamp}`,
      slug: `import-${stamp}`,
      adminEmail: `admin-${stamp}@import.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Import Admin',
    },
  });
  expect(res.status()).toBe(201);
  return res.json() as Promise<Reg>;
}

async function injectTokens(page: import('@playwright/test').Page, reg: Reg): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    ([at, rt]) => {
      window.localStorage.setItem('kpi-nexus.access-token', at);
      window.localStorage.setItem('kpi-nexus.refresh-token', rt);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('KPI bulk CSV import', () => {
  test('bad CSV shows errors and blocks commit; good CSV imports', { tag: ['@import'] }, async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');
    test.setTimeout(60_000);

    const stamp = suffix();
    const reg = await registerOrg(stamp);
    const apiCtx = await request.newContext({
      baseURL: API_URL,
      extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
    });

    await injectTokens(page, reg);
    await page.goto('/kpis/import');
    await expect(page.getByTestId('kpi-import-heading')).toBeVisible();

    // Bad CSV: invalid enum + non-numeric target.
    await page.getByTestId('kpi-import-textarea').fill(
      'name,scope,target\nBad Metric,GALAXY,xyz',
    );
    await page.getByTestId('kpi-import-dryrun').click();
    await expect(page.getByTestId('kpi-import-error-count')).toContainText('errors', { timeout: 10_000 });
    await expect(page.getByTestId('kpi-import-errors-table')).toBeVisible();
    // Commit disabled while errors present.
    await expect(page.getByTestId('kpi-import-commit')).toBeDisabled();

    // Good CSV via the sample button.
    const name1 = `Imported MRR ${stamp}`;
    await page.getByTestId('kpi-import-textarea').fill(
      `KPI Name,Type,Target\n${name1},CURRENCY,50000`,
    );
    await page.getByTestId('kpi-import-dryrun').click();
    await expect(page.getByTestId('kpi-import-valid-count')).toContainText('1 valid', { timeout: 10_000 });
    await expect(page.getByTestId('kpi-import-error-count')).toContainText('0 errors');

    await page.getByTestId('kpi-import-commit').click();
    await expect(page.getByTestId('kpi-import-done')).toBeVisible({ timeout: 10_000 });

    // Verify via API the KPI now exists.
    const list = (await (await apiCtx.get('/kpis')).json()) as Array<{ name: string }>;
    expect(list.some((k) => k.name === name1)).toBe(true);
  });
});
