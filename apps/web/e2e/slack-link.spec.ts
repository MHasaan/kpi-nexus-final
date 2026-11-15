/**
 * /integrations/slack/link — the page /kpi sends an unlinked Slack user to.
 * The full link flow needs a token signed with the server secret (covered by
 * the API's unit tests and a live check); here: signed-out users go to login,
 * and a bad or expired link shows a clear error and links nothing.
 */
import { expect, request, test } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

test('slack link: signed out → login; a bad link shows an error', async ({ page }) => {
  await page.goto('/integrations/slack/link?token=abc.def');
  await expect(page).toHaveURL(/\/login/);

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const anon = await request.newContext({ baseURL: API_URL });
  let reg: { accessToken: string; refreshToken: string };
  try {
    reg = (await (await anon.post('/auth/register', {
      data: {
        orgName: `SlackLink E2E ${stamp}`,
        slug: `slacklink-${stamp}`,
        adminEmail: `admin-${stamp}@slacklink.test.local`,
        adminPassword: 'correct-horse-battery-staple',
        adminFullName: 'Slack Admin',
      },
    })).json()) as { accessToken: string; refreshToken: string };
  } catch {
    test.skip(true, 'api not reachable');
    return;
  }
  await page.goto('/');
  await page.evaluate(
    ([a, r]) => {
      window.localStorage.setItem('kpi-nexus.access-token', a);
      window.localStorage.setItem('kpi-nexus.refresh-token', r);
    },
    [reg.accessToken, reg.refreshToken] as const,
  );
  await page.goto('/integrations/slack/link?token=not-a-real-token.forged');
  await page.getByTestId('slack-link-confirm').click();
  await expect(page.getByTestId('slack-link-error')).toContainText('invalid or has expired');
});
