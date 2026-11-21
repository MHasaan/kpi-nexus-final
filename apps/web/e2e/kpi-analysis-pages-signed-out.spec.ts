/**
 * Audit crawl (2026-11-20): opened by someone signed out, a KPI's Forecast, Anomalies, What-if and
 * Embed pages asked the API for the KPI — to name it in their heading — before sending the visitor to
 * sign in. The request was refused (401) and logged as an error in the browser console. The KPI's own
 * page asks for nothing until there is a session; these now do the same.
 */
import { expect, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

let apiUp = false;
test.beforeAll(async () => {
  try {
    apiUp = (await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    apiUp = false;
  }
});

for (const page of ['forecast', 'anomalies', 'whatif', 'embed']) {
  test(`signed out, a KPI's ${page} page goes to sign in and asks the API for nothing`, async ({ browser }) => {
    test.skip(!apiUp, 'api not reachable');
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const view = await context.newPage();
    const refused: string[] = [];
    view.on('response', (r) => {
      if (r.status() === 401) refused.push(`${r.request().method()} ${new URL(r.url()).pathname}`);
    });
    const errors: string[] = [];
    view.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await view.goto(`/kpis/cnotarealkpi0000000000000/${page}`);
    await expect(view).toHaveURL(/\/login(\?|$)/);
    // Give anything that was going to be asked for the time to be asked.
    await view.waitForLoadState('networkidle');
    expect(refused, 'requests refused for want of a session').toEqual([]);
    expect(errors, 'console errors').toEqual([]);
    await context.close();
  });
}
