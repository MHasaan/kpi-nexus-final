/**
 * /dashboards/archive page e2e (E3 gap-closure).
 *
 * Admin registers → creates a dashboard → soft-deletes it via API →
 * visits /dashboards/archive → asserts it's listed → clicks Restore →
 * asserts it disappears from the archive.
 *
 * Self-skips if the API at $API_URL is not reachable.
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
  if (!apiAvailable) {
    console.warn(`[skip] api not reachable at ${API_URL} — dashboard-archive e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('dashboard archive page: soft-delete → listed in archive → restore → gone', async ({ page }) => {
  if (!apiAvailable) {
    test.skip(true, 'api not reachable');
    return;
  }

  const stamp = suffix();

  // 1. Register a fresh admin org.
  const anon = await request.newContext({ baseURL: API_URL });
  const regRes = await anon.post('/auth/register', {
    data: {
      orgName: `DashArch ${stamp}`,
      slug: `dasharc-${stamp}`,
      adminEmail: `admin-${stamp}@dasharc.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'DashArch Admin',
    },
  });
  expect(regRes.ok()).toBeTruthy();
  const reg = (await regRes.json()) as { accessToken: string; refreshToken: string };

  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  // 2. Create a dashboard, then soft-delete it.
  const createRes = await api.post('/dashboards', {
    data: { name: `Archive Test ${stamp}`, description: 'e2e test dashboard' },
  });
  expect(createRes.ok()).toBeTruthy();
  const dashboard = (await createRes.json()) as { id: string; name: string };

  const deleteRes = await api.delete(`/dashboards/${dashboard.id}`);
  expect(deleteRes.status()).toBe(204);

  // 3. Inject tokens into the browser and navigate to /dashboards/archive.
  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );

  await page.goto('/dashboards/archive');

  // 4. The archived dashboard should be listed.
  await expect(page.getByText(`Archive Test ${stamp}`)).toBeVisible();

  // 5. Click Restore — the row should disappear.
  await page.getByTestId(`restore-${dashboard.id}`).click();
  await expect(page.getByText(`Archive Test ${stamp}`)).toHaveCount(0);
});

test('dashboard archive page: soft-delete → purge → gone', async ({ page }) => {
  if (!apiAvailable) {
    test.skip(true, 'api not reachable');
    return;
  }

  const stamp = suffix();

  const anon = await request.newContext({ baseURL: API_URL });
  const regRes = await anon.post('/auth/register', {
    data: {
      orgName: `DashPurge ${stamp}`,
      slug: `dashpurge-${stamp}`,
      adminEmail: `admin-${stamp}@dashpurge.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'DashPurge Admin',
    },
  });
  expect(regRes.ok()).toBeTruthy();
  const reg = (await regRes.json()) as { accessToken: string; refreshToken: string };

  const api = await request.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { authorization: `Bearer ${reg.accessToken}` },
  });

  const createRes = await api.post('/dashboards', {
    data: { name: `Purge Test ${stamp}` },
  });
  expect(createRes.ok()).toBeTruthy();
  const dashboard = (await createRes.json()) as { id: string };

  await api.delete(`/dashboards/${dashboard.id}`);

  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );

  await page.goto('/dashboards/archive');
  await expect(page.getByText(`Purge Test ${stamp}`)).toBeVisible();

  // Accept the confirm dialog, then click Purge.
  page.on('dialog', (d) => d.accept());
  await page.getByTestId(`purge-${dashboard.id}`).click();
  await expect(page.getByText(`Purge Test ${stamp}`)).toHaveCount(0);
});
