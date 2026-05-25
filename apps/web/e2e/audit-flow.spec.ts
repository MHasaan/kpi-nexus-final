/**
 * /settings/audit page e2e — admin audit log viewer.
 *
 * Admin registers via api → triggers an audited action (invite user) →
 * /settings/audit renders with the CREATE User entry visible.
 *
 * Also covers: filter dropdown narrows the list; bad filter returns
 * an empty state.
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
    console.warn(`[skip] api not reachable at ${API_URL} — audit e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
}

test.describe('/settings/audit page — admin audit log viewer', () => {
  test('admin sees CREATE User entry after inviting a teammate', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const slug = `audit-${stamp}`;
    const adminEmail = `admin-${stamp}@audit.test.local`;

    const apiCtx = await request.newContext({ baseURL: API_URL });

    // Register admin
    const regRes = await apiCtx.post('/auth/register', {
      data: {
        orgName: `Audit E2E ${stamp}`,
        slug,
        adminEmail,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Audit Admin',
      },
    });
    expect(regRes.status()).toBe(201);
    const reg: RegisterResult = await regRes.json();
    const adminToken = reg.accessToken;

    // Trigger one audited action: invite a teammate
    const inviteRes = await apiCtx.post('/users', {
      headers: { authorization: `Bearer ${adminToken}` },
      data: {
        email: `invitee-${stamp}@audit.test.local`,
        fullName: 'Audit Invitee',
      },
    });
    expect(inviteRes.status()).toBe(201);

    // Seed tokens, visit /settings/audit
    await page.goto('/');
    await page.evaluate(
      ([accessToken, refreshToken]) => {
        window.localStorage.setItem('kpi-nexus.access-token', accessToken);
        window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
      },
      [reg.accessToken, reg.refreshToken] as const,
    );

    await page.goto('/settings/audit');
    await expect(page.getByTestId('audit-heading')).toBeVisible();

    // List has at least one CREATE entry for the User entity
    const list = page.getByTestId('audit-list');
    await expect(list).toBeVisible();
    const createBadge = list.getByTestId('audit-action-badge').filter({ hasText: 'CREATE' });
    await expect(createBadge.first()).toBeVisible();

    // Filter to a definitely-absent entityType → empty state
    await page.getByTestId('filter-entity-type').fill('NotARealEntity');
    await page.getByTestId('audit-apply-filters').click();
    await expect(page.getByTestId('audit-empty')).toBeVisible();

    // Reset filter → list re-appears
    await page.getByTestId('filter-entity-type').fill('');
    await page.getByTestId('audit-apply-filters').click();
    await expect(page.getByTestId('audit-list')).toBeVisible();
  });

  test('filter by entity type narrows to that entity', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const slug = `audit-filter-${stamp}`;
    const apiCtx = await request.newContext({ baseURL: API_URL });
    const regRes = await apiCtx.post('/auth/register', {
      data: {
        orgName: `Audit Filter ${stamp}`,
        slug,
        adminEmail: `admin-${stamp}@audit.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Filter Admin',
      },
    });
    const reg: RegisterResult = await regRes.json();
    // Trigger BOTH a User mutation and an Organization mutation
    await apiCtx.post('/users', {
      headers: { authorization: `Bearer ${reg.accessToken}` },
      data: { email: `bob-${stamp}@audit.test.local`, fullName: 'Bob' },
    });
    await apiCtx.patch('/organizations/me', {
      headers: { authorization: `Bearer ${reg.accessToken}` },
      data: { roleLabel: 'Crew' },
    });

    await page.goto('/');
    await page.evaluate(
      ([accessToken, refreshToken]) => {
        window.localStorage.setItem('kpi-nexus.access-token', accessToken);
        window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
      },
      [reg.accessToken, reg.refreshToken] as const,
    );
    await page.goto('/settings/audit');

    await page.getByTestId('filter-entity-type').fill('Organization');
    await page.getByTestId('audit-apply-filters').click();

    // After filtering, only Organization entries should be visible
    const rows = page.getByTestId('audit-list').locator('li');
    await expect(rows.first()).toBeVisible();
    // Every row should show the Organization entity tag
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i++) {
      await expect(rows.nth(i)).toContainText('Organization');
    }
  });

  test('/settings/audit without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });
    await page.goto('/settings/audit');
    await expect(page).toHaveURL(/\/login$/);
  });
});
