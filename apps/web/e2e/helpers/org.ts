/**
 * Start a browser test as the admin of a brand-new organisation, without
 * driving the sign-up form. The form itself is covered by the specs that are
 * about signing up; every other spec only needs a signed-in admin.
 */
import { type Page, expect, request } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export interface NewOrg {
  orgName: string;
  slug: string;
  adminFullName: string;
  adminEmail: string;
  adminPassword: string;
}

export interface RegisteredOrg extends NewOrg {
  accessToken: string;
  refreshToken: string;
}

/**
 * POST /auth/register, store the session the way the app does, and land on
 * /dashboard. Returns what was registered plus the tokens.
 */
export async function registerOrgViaApi(page: Page, org: NewOrg): Promise<RegisteredOrg> {
  const api = await request.newContext({ baseURL: API_URL });
  const res = await api.post('/auth/register', { data: org });
  expect(res.status(), `POST /auth/register for ${org.slug}`).toBe(201);
  const { accessToken, refreshToken } = (await res.json()) as { accessToken: string; refreshToken: string };
  await api.dispose();

  await page.goto('/');
  await page.evaluate(
    ([access, refresh]) => {
      window.localStorage.setItem('kpi-nexus.access-token', access);
      window.localStorage.setItem('kpi-nexus.refresh-token', refresh);
    },
    [accessToken, refreshToken] as const,
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  return { ...org, accessToken, refreshToken };
}
