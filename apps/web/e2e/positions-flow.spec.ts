/**
 * /positions page e2e — admin CRUD UI for job positions.
 *
 * Admin registers via api → seeds tokens → /positions renders → creates
 * a new position → row appears with level + track badges → deletes it →
 * row disappears.
 *
 * Also covers: unauthenticated /positions redirects to /login.
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
    console.warn(`[skip] api not reachable at ${API_URL} — positions e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
}

async function registerAdminAndSeedTokens(
  page: import('@playwright/test').Page,
  slug: string,
): Promise<void> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Positions E2E ${slug}`,
      slug,
      adminEmail: `admin-${slug}@positions-e2e.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Positions Admin',
    },
  });
  expect(regRes.status()).toBe(201);
  const reg: RegisterResult = await regRes.json();

  await page.goto('/');
  await page.evaluate(
    ([accessToken, refreshToken]) => {
      window.localStorage.setItem('kpi-nexus.access-token', accessToken);
      window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
}

test.describe('/positions page — admin CRUD UI', () => {
  test('admin creates a position → it appears in the list → deletes it → it disappears', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAdminAndSeedTokens(page, `positions-create-${stamp}`);

    await page.goto('/positions');
    await expect(page.getByTestId('positions-heading')).toBeVisible();
    await expect(page.getByTestId('create-position-section')).toBeVisible();

    const positionName = `Senior Engineer ${stamp}`;
    await page.getByTestId('position-name-input').fill(positionName);
    await page.getByTestId('position-level-input').fill('5');
    await page.getByTestId('position-track-select').selectOption('IC');
    await page.getByTestId('position-paygrade-input').fill('P5');
    await page.getByTestId('position-submit-button').click();

    // Row appears with the level + track badges
    const row = page.getByTestId(`position-row-${positionName}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId(`position-level-${positionName}`)).toHaveText('L5');
    await expect(row).toContainText(/IC/);
    await expect(row).toContainText(/P5/);

    // Form fields cleared
    await expect(page.getByTestId('position-name-input')).toHaveValue('');
    await expect(page.getByTestId('position-paygrade-input')).toHaveValue('');

    // Delete the position
    await page.getByTestId(`delete-position-${positionName}`).click();
    await expect(row).not.toBeVisible();
  });

  test('create with a name that already exists → inline error, list unchanged', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    await registerAdminAndSeedTokens(page, `positions-dup-${stamp}`);

    await page.goto('/positions');
    const positionName = `Manager ${stamp}`;

    // Create once → success
    await page.getByTestId('position-name-input').fill(positionName);
    await page.getByTestId('position-level-input').fill('3');
    await page.getByTestId('position-submit-button').click();
    await expect(page.getByTestId(`position-row-${positionName}`)).toBeVisible();

    // Create again with the same name → api returns 409 → error surfaces
    await page.getByTestId('position-name-input').fill(positionName);
    await page.getByTestId('position-level-input').fill('3');
    await page.getByTestId('position-submit-button').click();
    await expect(page.getByTestId('position-error')).toBeVisible();
    await expect(page.getByTestId('position-error')).toContainText(/exist|conflict/i);
  });

  test('/positions without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });
    await page.goto('/positions');
    await expect(page).toHaveURL(/\/login$/);
  });
});
