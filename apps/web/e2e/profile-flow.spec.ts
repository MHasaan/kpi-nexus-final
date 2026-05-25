/**
 * /profile page e2e — user-facing profile + MFA enable/disable UI.
 *
 * Admin registers → /profile renders with account info → MFA status is
 * "Not enabled" → clicking "Enable MFA" shows the enrollment panel with
 * the secret, otpauth URL, and exactly 10 recovery codes → entering an
 * invalid code surfaces the api error → Cancel returns to the initial
 * state.
 *
 * The full confirm path is exercised by apps/api/test/integration/mfa-flow.spec.ts
 * which generates TOTP codes in-process. The FE test stops before
 * confirmation since computing a valid 6-digit code in the browser
 * would require shipping TOTP logic to the test bundle.
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
    console.warn(`[skip] api not reachable at ${API_URL} — profile e2e skipped`);
  }
});

function suffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface RegisterResult {
  accessToken: string;
  refreshToken: string;
  user: { email: string; fullName: string };
}

async function registerAndSeedTokens(
  page: import('@playwright/test').Page,
  stamp: string,
): Promise<RegisterResult> {
  const apiCtx = await request.newContext({ baseURL: API_URL });
  const regRes = await apiCtx.post('/auth/register', {
    data: {
      orgName: `Profile E2E ${stamp}`,
      slug: `profile-${stamp}`,
      adminEmail: `admin-${stamp}@profile.test.local`,
      adminPassword: 'correct-horse-battery-staple',
      adminFullName: 'Profile Admin',
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
  return reg;
}

test.describe('/profile page — account + MFA UI', () => {
  test('shows account info + MFA status "Not enabled" for a fresh account', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    const stamp = suffix();
    const reg = await registerAndSeedTokens(page, stamp);

    await page.goto('/profile');
    await expect(page.getByTestId('profile-heading')).toBeVisible();
    await expect(page.getByTestId('security-section')).toBeVisible();
    await expect(page.getByTestId('mfa-status')).toHaveText(/not enabled/i);
    await expect(page.getByTestId('enable-mfa-button')).toBeVisible();

    // Account info renders the email we registered with
    await expect(page.locator('body')).toContainText(reg.user.email);
  });

  test('Enable MFA → enrollment panel shows secret + otpauth URL + 10 recovery codes', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await registerAndSeedTokens(page, suffix());

    await page.goto('/profile');
    await page.getByTestId('enable-mfa-button').click();

    const panel = page.getByTestId('mfa-enrollment-panel');
    await expect(panel).toBeVisible();

    // Secret is a base32-ish string (some authenticators accept lowercase too,
    // so just assert non-empty, longish content)
    const secretText = (await page.getByTestId('mfa-secret').textContent()) ?? '';
    expect(secretText.length).toBeGreaterThan(15);

    // otpauth URL conforms to the otpauth://totp/<issuer>:<account>?secret=...&issuer=...
    const otpauthUrl = (await page.getByTestId('mfa-otpauth-url').textContent()) ?? '';
    expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUrl).toContain('secret=');
    expect(otpauthUrl).toContain('issuer=');

    // Exactly 10 recovery codes
    const codes = page.getByTestId('mfa-recovery-code');
    await expect(codes).toHaveCount(10);

    // Confirm form is visible but submit is disabled until 6 digits are typed
    await expect(page.getByTestId('mfa-confirm-button')).toBeDisabled();
    await page.getByTestId('mfa-confirm-code').fill('123456');
    await expect(page.getByTestId('mfa-confirm-button')).toBeEnabled();
  });

  test('Confirm with an invalid TOTP code → inline error, panel stays open', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await registerAndSeedTokens(page, suffix());

    await page.goto('/profile');
    await page.getByTestId('enable-mfa-button').click();
    await expect(page.getByTestId('mfa-enrollment-panel')).toBeVisible();

    // Deliberately bogus 6-digit code that will not match any TOTP step
    await page.getByTestId('mfa-confirm-code').fill('000000');
    await page.getByTestId('mfa-confirm-button').click();

    await expect(page.getByTestId('mfa-confirm-error')).toBeVisible();
    // Panel still open so the user can re-try
    await expect(page.getByTestId('mfa-enrollment-panel')).toBeVisible();
  });

  test('Cancel during enrollment closes the panel and re-shows the Enable button', async ({
    page,
  }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await registerAndSeedTokens(page, suffix());

    await page.goto('/profile');
    await page.getByTestId('enable-mfa-button').click();
    await expect(page.getByTestId('mfa-enrollment-panel')).toBeVisible();

    await page.getByTestId('mfa-cancel-button').click();
    await expect(page.getByTestId('mfa-enrollment-panel')).not.toBeVisible();
    await expect(page.getByTestId('enable-mfa-button')).toBeVisible();
  });

  test('/profile without a token redirects to /login', async ({ page }) => {
    test.skip(!apiAvailable, 'api not reachable');

    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.removeItem('kpi-nexus.access-token');
      window.localStorage.removeItem('kpi-nexus.refresh-token');
    });
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login$/);
  });
});
