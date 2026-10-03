/**
 * Audit page crawl — visits every App Router page as several personas and
 * records what goes wrong. It does not assert; it writes findings to
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

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';
const WEB_ROOT = resolve(__dirname, '..', '..');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const OUT_DIR = join(REPO_ROOT, 'docs', 'audit');
const PASSWORD = 'Password123!';
const SETTLE_MS = 2500;

type Persona = 'admin' | 'contrib' | 'anon';

interface PageResult {
  route: string;
  url: string;
  persona: Persona | 'admin@375px';
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

async function apiLogin(email: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return (await res.json()) as { accessToken: string; refreshToken: string };
}

async function apiGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return (await res.json()) as T;
}

const first = (x: unknown): { id: string } => {
  const list = Array.isArray(x) ? x : ((x as { items?: unknown[] })?.items ?? []);
  return list[0] as { id: string };
};

/** Real helios ids for every dynamic segment. */
async function resolveParams(adminToken: string) {
  const kpiList = await apiGet<unknown>(adminToken, '/kpis');
  const kpi = ((Array.isArray(kpiList) ? kpiList : (kpiList as { items?: unknown[] }).items ?? []) as { id: string; name: string }[]).find(
    (k) => k.name === 'Monthly Recurring Revenue',
  );
  if (!kpi) throw new Error('helios seed not found (no "Monthly Recurring Revenue" KPI)');
  const dash = first(await apiGet(adminToken, '/dashboards'));
  const widgets = await apiGet<unknown>(adminToken, `/dashboards/${dash.id}/widgets`);
  const tom = await apiLogin('tom.becker@helios.io');
  const tomMe = await apiGet<{ user: { id: string } }>(tom.accessToken, '/auth/me');
  const embed = await fetch(`${API}/reports/kpis/${kpi.id}/embed-token`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
    body: '{}',
  }).then((r) => r.json() as Promise<{ token: string }>);
  return {
    kpis: kpi.id,
    dashboards: dash.id,
    wid: first(widgets).id,
    users: tomMe.user.id,
    alerts: first(await apiGet(adminToken, '/alerts')).id,
    connectors: first(await apiGet(adminToken, '/connectors')).id,
    okrs: first(await apiGet(adminToken, '/objectives')).id,
    reports: first(await apiGet(adminToken, '/scheduled-reports')).id,
    shareToken: 'helios_share_overview_demo_0001',
    embedToken: embed.token,
  };
}

function fill(route: string, ids: Awaited<ReturnType<typeof resolveParams>>): string {
  const section = route.split('/')[1] as keyof typeof ids;
  return route
    .replace('[wid]', ids.wid)
    .replace('/share/[token]', `/share/${ids.shareToken}`)
    .replace('/embed/kpi/[token]', `/embed/kpi/${ids.embedToken}`)
    .replace('[id]', String(ids[section] ?? 'missing-id'));
}

/** Visit one URL and collect everything that went wrong. */
async function visit(page: Page, route: string, url: string, persona: PageResult['persona']): Promise<PageResult> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const onConsole = (m: import('@playwright/test').ConsoleMessage) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  };
  const onPageError = (e: Error) => pageErrors.push(`${e.name}: ${e.message}`.slice(0, 300));
  const onResponse = (r: import('@playwright/test').Response) => {
    const u = r.url();
    if (r.status() >= 400 && (u.includes(':4000') || (u.includes(':3000') && r.request().resourceType() === 'document')))
      failedRequests.push(`${r.status()} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`.slice(0, 200));
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);

  const started = Date.now();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  } catch (err) {
    pageErrors.push(`navigation: ${String(err).slice(0, 200)}`);
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
        errorScreen: hit ?? (/\b[1-9]\d* (?:issue|error)s?\b/i.test(overlayText) ? `dev overlay: ${overlayText.slice(0, 160)}` : undefined),
        emptyMain: main ? main.innerText.trim().length < 20 : text.trim().length < 20,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    })
    .catch(() => ({ errorScreen: 'evaluate failed', emptyMain: true, overflow: 0 }));

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);

  return {
    route,
    url: url.replace(/(\/(?:share|embed\/kpi)\/)[^/?]+/, '$1<token>'),
    persona,
    finalPath: new URL(page.url()).pathname.replace(/(\/(?:share|embed\/kpi)\/)[^/?]+/, '$1<token>'),
    ms,
    consoleErrors: [...new Set(consoleErrors)],
    pageErrors: [...new Set(pageErrors)],
    failedRequests: [...new Set(failedRequests)],
    errorScreen: probe.errorScreen,
    emptyMain: probe.emptyMain,
    ...(persona === 'admin@375px' ? { horizontalOverflowPx: probe.overflow > 1 ? probe.overflow : 0 } : {}),
  };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(60 * 60_000);
// Long-running audit tool, not a regression test — opt in so `playwright test` stays fast.
test.skip(!process.env.AUDIT_CRAWL, 'set AUDIT_CRAWL=1 to run the audit page crawl');

test('audit: crawl every page as admin, contributor, anonymous, and at 375 px', async ({ browser }) => {
  const routes = pageRoutes();
  expect(routes.length).toBeGreaterThan(50);
  const ids = await resolveParams((await apiLogin('admin@helios.io')).accessToken);

  const sessions: Array<{ persona: PageResult['persona']; email?: string; viewport?: { width: number; height: number } }> = [
    { persona: 'admin', email: 'admin@helios.io' },
    { persona: 'contrib', email: 'tom.becker@helios.io' },
    { persona: 'anon' },
    { persona: 'admin@375px', email: 'admin@helios.io', viewport: { width: 375, height: 812 } },
  ];
  // CRAWL_PASSES=contrib,admin@375px re-runs only those passes and merges with the previous report.
  const wanted = process.env.CRAWL_PASSES?.split(',').map((s) => s.trim());
  const outFile = join(OUT_DIR, 'frontend-crawl.json');
  const previous: PageResult[] =
    wanted && existsSync(outFile) ? (JSON.parse(readFileSync(outFile, 'utf-8')) as { results: PageResult[] }).results : [];
  const results: PageResult[] = previous.filter((r) => !wanted?.includes(r.persona));

  for (const s of sessions) {
    if (wanted && !wanted.includes(s.persona)) continue;
    const context = await browser.newContext({ viewport: s.viewport ?? { width: 1440, height: 900 } });
    const page = await context.newPage();
    if (s.email) {
      // Fresh login per pass, seeded once — the app then rotates/refreshes its own
      // tokens. (Re-injecting the same pair on every navigation breaks refresh once
      // the 15-minute access token expires.)
      const t = await apiLogin(s.email);
      await page.goto('/login');
      await page.evaluate(([a, r]) => {
        window.localStorage.setItem('kpi-nexus.access-token', a);
        window.localStorage.setItem('kpi-nexus.refresh-token', r);
      }, [t.accessToken, t.refreshToken] as const);
    }
    for (const route of routes) {
      results.push(await visit(page, route, fill(route, ids), s.persona));
    }
    await context.close();
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(outFile,`${JSON.stringify({ generatedAt: new Date().toISOString(), routes: routes.length, results }, null, 2)}\n`);

  // Markdown summary — one row per route, one column per persona.
  const cell = (r?: PageResult) => {
    if (!r) return '—';
    const bad: string[] = [];
    if (r.errorScreen) bad.push(`❌ ${r.errorScreen.slice(0, 40)}`);
    if (r.pageErrors.length) bad.push(`❌ ${r.pageErrors.length} page error(s)`);
    const fails5 = r.failedRequests.filter((f) => f.startsWith('5'));
    if (fails5.length) bad.push(`❌ ${fails5.length}×5xx`);
    const fails4 = r.failedRequests.filter((f) => f.startsWith('4'));
    if (fails4.length) bad.push(`⚠️ ${fails4.length}×4xx`);
    if (r.consoleErrors.length) bad.push(`⚠️ ${r.consoleErrors.length} console`);
    if (r.emptyMain) bad.push('⚠️ empty');
    if (r.horizontalOverflowPx) bad.push(`⚠️ overflow ${r.horizontalOverflowPx}px`);
    const where = r.finalPath !== new URL(r.url, 'http://x').pathname ? ` → ${r.finalPath}` : '';
    return `${bad.length ? bad.join(', ') : '✅'}${where} (${(r.ms / 1000).toFixed(1)}s)`;
  };
  const rows = routes.map((route) => {
    const by = (p: PageResult['persona']) => results.find((r) => r.route === route && r.persona === p);
    return `| \`${route}\` | ${cell(by('admin'))} | ${cell(by('contrib'))} | ${cell(by('anon'))} | ${cell(by('admin@375px'))} |`;
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
});
