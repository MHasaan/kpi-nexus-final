/**
 * Audit page crawl — visits every App Router page as several personas and
 * records what goes wrong. It fails on incomplete coverage and writes findings to
 * docs/audit/frontend-crawl.{json,md} for triage.
 *
 * Per page it captures: console errors, uncaught page errors, failed API
 * calls (4xx/5xx), the Next.js error overlay / generic error screens, an empty
 * <main>, where the page ended up (redirects) and load time. A second pass at
 * 375 px width checks for horizontal overflow.
 *
 * Prereqs: web :3000, api :4000 running, `helios` seeded.
 *
 *   AUDIT_CRAWL=1 pnpm --filter @kpi-nexus/web exec playwright test e2e/audit/page-crawl.spec.ts --workers=1 --retries=0 --reporter=list
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { type Page, expect, test } from '@playwright/test';

import { auditExcerpt, auditJson, auditOutputDir, crawlNeedsRefresh, redactAuditText } from '../../../../scripts/audit/common.mjs';

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';
const WEB_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const OUT_DIR = auditOutputDir(REPO_ROOT);
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';
const SETTLE_MS = 2500;

type Persona = 'admin' | 'contrib' | 'anon';

type CrawlPersona = Persona | 'admin@375px';
type CoverageGap = { route: string; persona: CrawlPersona; uncovered: string };
type PageResult = VisitedPage | CoverageGap;

interface VisitedPage {
  route: string;
  url: string;
  persona: CrawlPersona;
  finalPath: string;
  ms: number;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  errorScreen?: string;
  emptyMain: boolean;
  horizontalOverflowPx?: number;
}

/** All App Router page routes, from the filesystem (route groups stripped). */
function pageRoutes(): string[] {
  const appDir = join(WEB_ROOT, 'src', 'app');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'page.tsx') {
        const route = `/${relative(appDir, dir).replaceAll('\\', '/')}`
          .replace(/\/\([^)]+\)/g, '')
          .replace(/\/$/, '');
        out.push(route || '/');
      }
    }
  };
  walk(appDir);
  return out.sort();
}

type Session = { accessToken: string; refreshToken: string };
type Profile = {
  user: { id: string; email: string; organizationId: string };
  accessProfile: { capabilities: string[]; isAdmin: boolean };
};

const ADMIN = 'admin@helios.io';
const CONTRIB = 'tom.becker@helios.io';

async function apiRequest<T>(path: string, token?: string, body?: object): Promise<T> {
  const method = body ? 'POST' : 'GET';
  const safePath = redactAuditText(path);
  let res: globalThis.Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      signal: AbortSignal.timeout(15_000),
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw new Error(`${method} ${safePath} failed: ${auditExcerpt(error, 120)}`);
  }
  if (!res.ok) throw new Error(`${method} ${safePath}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function apiSession(path: '/auth/login' | '/auth/refresh', body: object): Promise<Session> {
  const session = await apiRequest<Session>(path, undefined, body);
  if (!session.accessToken || !session.refreshToken || crawlNeedsRefresh(session.accessToken)) {
    throw new Error(`${path} did not return a usable session`);
  }
  return session;
}

const apiLogin = (email: string) => apiSession('/auth/login', { email, password: PASSWORD });

async function verifyPersona(token: string, email: string, orgId?: string) {
  const { user, accessProfile } = await apiRequest<Profile>('/auth/me', token);
  if (user?.email !== email || !user.id || !user.organizationId || (orgId && user.organizationId !== orgId) ||
      !Array.isArray(accessProfile?.capabilities) || accessProfile.isAdmin !== (email === ADMIN)) {
    throw new Error(`wrong identity, tenant, or access profile for ${email}`);
  }
  return user;
}

async function installSession(page: Page, session: Session) {
  await page.evaluate(({ accessToken, refreshToken }) => {
    window.localStorage.setItem('kpi-nexus.access-token', accessToken);
    window.localStorage.setItem('kpi-nexus.refresh-token', refreshToken);
  }, session);
}

async function browserSession(page: Page) {
  return page.evaluate(() => ({
    accessToken: window.localStorage.getItem('kpi-nexus.access-token'),
    refreshToken: window.localStorage.getItem('kpi-nexus.refresh-token'),
  }));
}

async function ensureSession(page: Page, email: string | undefined, orgId?: string, verify = false) {
  const { accessToken: initialAccessToken, refreshToken } = await browserSession(page);
  let accessToken = initialAccessToken;
  if (!email) {
    if (accessToken || refreshToken) throw new Error('anonymous pass has authentication tokens');
    return;
  }
  if (!accessToken || !refreshToken) throw new Error(`browser session missing for ${email}`);
  if (crawlNeedsRefresh(accessToken)) {
    const refreshed = await apiSession('/auth/refresh', { refreshToken });
    await installSession(page, refreshed);
    accessToken = refreshed.accessToken;
    verify = true;
  }
  if (verify) await verifyPersona(accessToken, email, orgId);
}

type Fixture = { value: string } | { error: string };
type Fixtures = Record<string, Fixture>;

const items = (payload: { items?: unknown[] } | unknown[]) =>
  (Array.isArray(payload) ? payload : payload?.items ?? []) as Array<{ id?: string; name?: string }>;

/** Resolve each fixture independently so one missing entity does not hide the other routes. */
async function resolveParams(adminToken: string, orgId: string): Promise<Fixtures> {
  const ids: Fixtures = {};
  async function fixture(key: string, resolveValue: () => Promise<string | undefined>) {
    try {
      const value = await resolveValue();
      ids[key] = value ? { value } : { error: `no ${key} fixture in Helios` };
    } catch (error) {
      ids[key] = { error: auditExcerpt(error, 200) };
    }
  }

  const firstId = async (path: string) => items(await apiRequest(path, adminToken))[0]?.id;
  await Promise.all([
    fixture('kpis', async () => items(await apiRequest('/kpis', adminToken)).find((k) => k.name === 'Monthly Recurring Revenue')?.id),
    fixture('dashboards', () => firstId('/dashboards')),
    fixture('users', async () => (await verifyPersona((await apiLogin(CONTRIB)).accessToken, CONTRIB, orgId)).id),
    fixture('alerts', () => firstId('/alerts')),
    fixture('connectors', () => firstId('/connectors')),
    fixture('okrs', () => firstId('/objectives')),
    fixture('reports', () => firstId('/scheduled-reports')),
    fixture('shareToken', async () => {
      const token = 'helios_share_overview_demo_0001';
      await apiRequest(`/public/dashboards/${token}`);
      return token;
    }),
  ]);
  await Promise.all([
    fixture('wid', async () => {
      const dashboard = ids.dashboards;
      if (!dashboard || 'error' in dashboard) return undefined;
      return firstId(`/dashboards/${dashboard.value}/widgets`);
    }),
    fixture('embedToken', async () => {
      const kpi = ids.kpis;
      if (!kpi || 'error' in kpi) return undefined;
      return (await apiRequest<{ token: string }>(`/reports/kpis/${kpi.value}/embed-token`, adminToken, {})).token;
    }),
  ]);
  return ids;
}

function fill(route: string, ids: Fixtures): Fixture {
  const section = route.split('/')[1];
  let url = route;
  for (const [segment, key] of [
    ['[id]', section], ['[wid]', 'wid'], ['[token]', section === 'share' ? 'shareToken' : 'embedToken'],
  ] as const) {
    if (!url.includes(segment)) continue;
    const id = key ? ids[key] : undefined;
    if (!id) return { error: `no fixture resolver for ${segment}` };
    if ('error' in id) return id;
    url = url.replace(segment, encodeURIComponent(id.value));
  }
  return url.includes('[') ? { error: 'unrecognized dynamic segment' } : { value: url };
}

/** Visit one URL and collect everything that went wrong. */
async function visit(page: Page, route: string, url: string, persona: CrawlPersona, webOrigin: string): Promise<VisitedPage> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const apiOrigin = new URL(API).origin;
  const onConsole = (m: import('@playwright/test').ConsoleMessage) => {
    if (m.type() === 'error') consoleErrors.push(auditExcerpt(m.text(), 300));
  };
  const onPageError = (e: Error) => pageErrors.push(auditExcerpt(`${e.name}: ${e.message}`, 300));
  const belongsToCrawl = (url: URL, resource: string) =>
    url.origin === apiOrigin || (url.origin === webOrigin && resource === 'document');
  const onResponse = (r: import('@playwright/test').Response) => {
    const url = new URL(r.url());
    if (r.status() >= 400 && belongsToCrawl(url, r.request().resourceType())) {
      failedRequests.push(auditExcerpt(`${r.status()} ${r.request().method()} ${url.pathname}${url.search}`, 200));
    }
  };
  const onRequestFailed = (r: import('@playwright/test').Request) => {
    const url = new URL(r.url());
    const error = r.failure()?.errorText;
    if (error !== 'net::ERR_ABORTED' && belongsToCrawl(url, r.resourceType())) {
      failedRequests.push(auditExcerpt(`failed ${r.method()} ${url.pathname}${url.search}: ${error ?? 'network error'}`, 200));
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  const started = Date.now();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  } catch (err) {
    pageErrors.push(`navigation: ${auditExcerpt(err, 200)}`);
  }
  await page.waitForTimeout(SETTLE_MS);
  const ms = Date.now() - started;

  const probe = await page
    .evaluate(() => {
      const text = document.body?.innerText ?? '';
      const overlay = document.querySelector('nextjs-portal');
      const overlayText = overlay?.shadowRoot?.textContent ?? '';
      const markers = ['Application error', 'Unhandled Runtime Error', 'Something went wrong', 'This page could not be found', 'Internal Server Error'];
      const hit = markers.find((m) => text.includes(m) || overlayText.includes(m));
      const main = document.querySelector('main');
      return {
        errorScreen: hit ?? (/\b[1-9]\d* (?:issue|error)s?\b/i.test(overlayText) ? `dev overlay: ${overlayText}` : undefined),
        emptyMain: main ? main.innerText.trim().length < 20 : text.trim().length < 20,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    })
    .catch(() => ({ errorScreen: 'evaluate failed', emptyMain: true, overflow: 0 }));

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  page.off('requestfailed', onRequestFailed);

  return {
    route,
    url: redactAuditText(url),
    persona,
    finalPath: redactAuditText(new URL(page.url()).pathname),
    ms,
    consoleErrors: [...new Set(consoleErrors)],
    pageErrors: [...new Set(pageErrors)],
    failedRequests: [...new Set(failedRequests)],
    errorScreen: probe.errorScreen ? auditExcerpt(probe.errorScreen, 160) : undefined,
    emptyMain: probe.emptyMain,
    ...(persona === 'admin@375px' ? { horizontalOverflowPx: probe.overflow > 1 ? probe.overflow : 0 } : {}),
  };
}

test.describe.configure({ mode: 'serial' });
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.setTimeout(60 * 60_000);
// Long-running audit tool, not a regression test — opt in so `playwright test` stays fast.
test.skip(!process.env.AUDIT_CRAWL, 'set AUDIT_CRAWL=1 to run the audit page crawl');

test('audit: crawl every page as admin, contributor, anonymous, and at 375 px', async ({ browser, baseURL }) => {
  const routes = pageRoutes();
  expect(routes.length).toBeGreaterThan(50);
  if (!baseURL) throw new Error('crawler requires a Playwright baseURL');

  const sessions: Array<{ persona: CrawlPersona; email?: string; viewport?: { width: number; height: number } }> = [
    { persona: 'admin', email: ADMIN },
    { persona: 'contrib', email: CONTRIB },
    { persona: 'anon' },
    { persona: 'admin@375px', email: ADMIN, viewport: { width: 375, height: 812 } },
  ];
  // CRAWL_PASSES=contrib,admin@375px re-runs only those passes and merges with the previous report.
  const wanted = process.env.CRAWL_PASSES?.split(',').map((s) => s.trim());
  if (wanted?.some((persona) => !sessions.some((s) => s.persona === persona))) {
    throw new Error('CRAWL_PASSES includes an unknown persona');
  }
  const outFile = join(OUT_DIR, 'frontend-crawl.json');
  const previous: PageResult[] =
    wanted && existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf-8')) as { results: PageResult[] }).results : [];
  const results: PageResult[] = previous.filter((r) => !wanted?.includes(r.persona));
  const attempted: PageResult[] = [];
  const passFailures: string[] = [];
  let fixtureFailure: string | undefined;
  let orgId: string | undefined;
  let ids: Fixtures = {};

  try {
    const { accessToken } = await apiLogin(ADMIN);
    const org = await apiRequest<{ id: string; slug: string }>('/organizations/me', accessToken);
    if (org.slug !== 'helios' || !org.id) throw new Error('Helios organization fixture missing');
    orgId = (await verifyPersona(accessToken, ADMIN, org.id)).organizationId;
    ids = await resolveParams(accessToken, orgId);
  } catch (error) {
    fixtureFailure = auditExcerpt(error, 200);
  }

  for (const s of sessions) {
    if (wanted && !wanted.includes(s.persona)) continue;
    const context = await browser.newContext({ baseURL, viewport: s.viewport ?? { width: 1440, height: 900 } });
    const pending = routes.slice();
    try {
      if (s.email && fixtureFailure) throw new Error(fixtureFailure);
      const page = await context.newPage();
      const loginPage = await page.goto('/login');
      if (!loginPage?.ok()) throw new Error(`web login page unavailable (HTTP ${loginPage?.status() ?? 'unknown'})`);
      if (s.email) await installSession(page, await apiLogin(s.email));
      await ensureSession(page, s.email, orgId, true);
      for (const route of routes) {
        const fixture = fill(route, ids);
        if ('error' in fixture) {
          attempted.push({ route, persona: s.persona, uncovered: fixtureFailure ?? fixture.error });
        } else {
          // Read the current browser tokens so refresh rotates the active pair.
          await ensureSession(page, s.email, orgId);
          attempted.push(await visit(page, route, fixture.value, s.persona, new URL(baseURL).origin));
        }
        pending.shift();
      }
      await ensureSession(page, s.email, orgId, true);
    } catch (error) {
      const reason = auditExcerpt(error, 200);
      passFailures.push(`${s.persona}: ${reason}`);
      attempted.push(...pending.map((route) => ({ route, persona: s.persona, uncovered: reason })));
    } finally {
      await context.close();
    }
  }
  results.push(...attempted);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outFile, auditJson({ generatedAt: new Date().toISOString(), routes: routes.length, fixtureFailure, passFailures, results }));

  // Markdown summary — one row per route, one column per persona.
  const cell = (r?: PageResult) => {
    if (!r) return '—';
    if ('uncovered' in r) return `⏭ Uncovered: ${auditExcerpt(r.uncovered, 100)}`;
    const bad: string[] = [];
    if (r.errorScreen) bad.push(`❌ ${auditExcerpt(r.errorScreen, 40)}`);
    if (r.pageErrors.length) bad.push(`❌ ${r.pageErrors.length} page error(s)`);
    const fails5 = r.failedRequests.filter((f) => f.startsWith('5'));
    if (fails5.length) bad.push(`❌ ${fails5.length}×5xx`);
    const failedNetwork = r.failedRequests.filter((f) => f.startsWith('failed '));
    if (failedNetwork.length) bad.push(`❌ ${failedNetwork.length} network error(s)`);
    const fails4 = r.failedRequests.filter((f) => f.startsWith('4'));
    if (fails4.length) bad.push(`⚠️ ${fails4.length}×4xx`);
    if (r.consoleErrors.length) bad.push(`⚠️ ${r.consoleErrors.length} console`);
    if (r.emptyMain) bad.push('⚠️ empty');
    if (r.horizontalOverflowPx) bad.push(`⚠️ overflow ${r.horizontalOverflowPx}px`);
    const where = r.finalPath !== new URL(r.url, 'http://x').pathname ? ` → ${r.finalPath}` : '';
    return `${bad.length ? bad.join(', ') : '✅'}${where} (${(r.ms / 1000).toFixed(1)}s)`;
  };
  const safeCell = (r?: PageResult) => redactAuditText(cell(r)).replaceAll('|', '\\|').replace(/\s+/g, ' ');
  const rows = routes.map((route) => {
    const by = (p: PageResult['persona']) => results.find((r) => r.route === route && r.persona === p);
    return `| \`${route}\` | ${safeCell(by('admin'))} | ${safeCell(by('contrib'))} | ${safeCell(by('anon'))} | ${safeCell(by('admin@375px'))} |`;
  });
  writeFileSync(
    join(OUT_DIR, 'frontend-crawl.md'),
    [
      '# Frontend page crawl',
      '',
      `Generated ${new Date().toISOString()} by \`apps/web/e2e/audit/page-crawl.spec.ts\` — ${routes.length} routes × 4 passes. Details per page in [frontend-crawl.json](./frontend-crawl.json).`,
      '',
      '| Route | Admin | Contributor (tom.becker) | Logged out | Admin @ 375 px |',
      '|---|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );
  const gaps = attempted.filter((result) => 'uncovered' in result).length;
  expect({ gaps, fixtureFailure, passFailures }, 'crawl coverage').toEqual({ gaps: 0, fixtureFailure: undefined, passFailures: [] });
});
