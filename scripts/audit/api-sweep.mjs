#!/usr/bin/env node
/**
 * Live GET sweep of apps/api (audit tooling).
 *
 * Calls every GET route from docs/audit/api-routes.json as several personas of
 * the seeded `helios` org plus anonymous, filling path params with real IDs
 * read from Postgres, and records status / latency / error excerpt for each.
 * Writes docs/audit/api-sweep.json and prints the anomalies.
 *
 * Prereqs: stack running (API on API_URL), `helios` seeded, routes generated
 * (node scripts/audit/api-routes.mjs).
 *
 *   node --env-file=.env scripts/audit/api-sweep.mjs
 *
 * Side effects: mints one KPI embed token (to exercise /public/embed/kpi/:token).
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://kpi_nexus:dev_password@127.0.0.1:5432/kpi_nexus';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';
const SLOW_MS = 1000;

/** Mask secret-looking JSON fields before anything is written to the committed report. */
const SECRET_FIELD = /"(token|secret|signingSecret|apiKey|key|plaintext|password|accessToken|refreshToken|inviteToken|hashedKey)"s*:s*"[^"]*"/g;
const redact = (s) => String(s).replace(SECRET_FIELD, '"$1":"<redacted>"');

const TIMEOUT_MS = 15_000;

const PERSONAS = [
  { key: 'admin', email: 'admin@helios.io', label: 'Administrator' },
  { key: 'exec', email: 'greg.sullivan@helios.io', label: 'Executive (VP Sales)' },
  { key: 'manager', email: 'devon.reyes@helios.io', label: 'Department Manager' },
  { key: 'contrib', email: 'tom.becker@helios.io', label: 'Contributor (Engineer)' },
];

// Sensible query strings for GET routes that need one to do real work.
const QUERY = {
  '/search': 'q=revenue',
  '/comments': 'entityType=kpi&entityId=:kpis',
  '/kpis/:id/data': 'limit=50',
  '/lineage/:type/:id/upstream': 'depth=2',
  '/lineage/:type/:id/downstream': 'depth=2',
};

// ---------------------------------------------------------------------------
// Real IDs from the helios org
// ---------------------------------------------------------------------------
async function loadIds() {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0] ?? {};
  try {
    const { id: org } = await one(`SELECT id FROM "Organization" WHERE slug = 'helios'`);
    if (!org) throw new Error('helios org not found — run the seed first');
    const q = (table, extra = '') => one(`SELECT id FROM "${table}" WHERE "organizationId" = $1 ${extra} LIMIT 1`, [org]);
    const lineage = await one(`SELECT "sourceId" AS id FROM "LineageEdge" WHERE "organizationId" = $1 LIMIT 1`, [org]);
    const mrr = await one(`SELECT id FROM "KPI" WHERE "organizationId" = $1 AND name = 'Monthly Recurring Revenue'`, [org]);
    const contrib = await one(`SELECT id FROM "User" WHERE email = 'tom.becker@helios.io'`);
    const share = await one(`SELECT token FROM "DashboardShareLink" WHERE "organizationId" = $1 LIMIT 1`, [org]);
    const tpl = await one(`SELECT slug FROM "OrgTemplate" LIMIT 1`);
    return {
      org,
      ids: {
        'alert-rules': (await q('AlertRule')).id,
        alerts: (await q('Alert')).id,
        connectors: (await q('Connector')).id,
        dashboards: (await q('Dashboard')).id,
        snapshots: (await q('DashboardSnapshot')).id,
        integrations: (await q('IntegrationConnection')).id,
        'kpi-categories': (await q('KPICategory')).id,
        kpis: mrr.id,
        lineage: lineage.id,
        objectives: (await q('Objective')).id,
        onboarding: (await q('OnboardingSession')).id,
        'org-units': (await q('OrgUnit')).id,
        plugins: (await q('Plugin')).id,
        positions: (await q('Position')).id,
        roles: (await q('RoleDefinition')).id,
        'scheduled-reports': (await q('ScheduledReport')).id,
        tasks: (await q('Task')).id,
        users: contrib.id,
        workflows: (await q('Workflow')).id,
      },
      shareToken: share.token,
      templateSlug: tpl.slug,
    };
  } finally {
    await db.end();
  }
}

/** Fill a route path's params with real IDs. Returns null when an ID is unavailable. */
function fill(path, ctx) {
  const seg = path.split('/')[1];
  const resourceFor = (p) => {
    if (p.startsWith('/dashboards/snapshots')) return 'snapshots';
    if (p.startsWith('/lineage')) return 'lineage';
    if (p.startsWith('/scim/v2/Users')) return 'users';
    if (p.startsWith('/scim/v2/Groups')) return 'org-units';
    return seg;
  };
  let missing = false;
  const out = path.replace(/:(\w+)/g, (_, name) => {
    let v;
    if (name === 'type') v = 'kpi';
    else if (name === 'token') v = path.includes('/embed/') ? ctx.embedToken : ctx.shareToken;
    else if (name === 'slug') v = ctx.templateSlug;
    else if (name === 'kpiId') v = ctx.ids.kpis;
    else if (name === 'orgUnitId') v = ctx.ids['org-units'];
    else if (name === 'userId') v = ctx.ids.users;
    else if (name === 'snapshotId') v = ctx.ids.snapshots;
    else v = ctx.ids[resourceFor(path)];
    if (!v) missing = true;
    return encodeURIComponent(v ?? '');
  });
  return missing ? null : out;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function call(method, url, token, body) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const ms = Math.round(performance.now() - started);
    const type = res.headers.get('content-type') ?? '';
    let excerpt = '';
    if (type.includes('text/event-stream')) {
      ctrl.abort(); // SSE: headers are enough
      excerpt = '[event-stream]';
    } else {
      const text = await res.text();
      excerpt = redact(text.slice(0, 300));
    }
    return { status: res.status, ms, type: type.split(';')[0], excerpt };
  } catch (err) {
    return { status: 0, ms: Math.round(performance.now() - started), excerpt: String(err?.cause?.code ?? err?.name ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function login(email) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} → ${res.status} ${await res.text()}`);
  return (await res.json()).accessToken;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const routes = JSON.parse(await readFile(join(REPO_ROOT, 'docs', 'audit', 'api-routes.json'), 'utf-8'));
const gets = routes.filter((r) => r.method === 'GET');
const ctx = await loadIds();

const tokens = {};
for (const p of PERSONAS) tokens[p.key] = await login(p.email);
const meByPersona = {};
const profiles = {};
for (const p of PERSONAS) {
  const me = await fetch(`${API_URL}/auth/me`, { headers: { authorization: `Bearer ${tokens[p.key]}` } });
  meByPersona[p.key] = me.status;
  // Effective capabilities as the resolver computes them (role + inheritance + overrides + delegations).
  const { accessProfile } = await me.json();
  if (!accessProfile?.capabilities) throw new Error(`no accessProfile for ${p.email} — permission checks would be skipped`);
  profiles[p.key] = accessProfile;
}

// Embed token for /public/embed/kpi/:token (admin-minted).
const embed = await fetch(`${API_URL}/reports/kpis/${ctx.ids.kpis}/embed-token`, {
  method: 'POST',
  headers: { authorization: `Bearer ${tokens.admin}`, 'content-type': 'application/json' },
  body: '{}',
});
ctx.embedToken = embed.ok ? (await embed.json()).token : undefined;

const results = [];
for (const route of gets) {
  const filled = fill(route.path, ctx);
  const entry = { method: route.method, path: route.path, url: filled, public: route.public,
    permissions: route.permissions, anyPermissions: route.anyPermissions, guards: route.guards, by: {} };
  if (!filled) {
    entry.skipped = 'no id available';
    results.push(entry);
    continue;
  }
  const qs = QUERY[route.path]?.replace(/:(\w[\w-]*)/g, (_, k) => ctx.ids[k] ?? '');
  const url = `${API_URL}${filled}${qs ? `?${qs}` : ''}`;
  // Never persist bearer-style secrets (share/embed tokens) in the committed report.
  entry.url = url.replace(API_URL, '').replace(/(\/public\/(?:dashboards|embed\/kpi)\/)[^/?]+/, '$1<token>');
  for (const p of [...PERSONAS.map((x) => x.key), 'anon']) {
    entry.by[p] = await call('GET', url, p === 'anon' ? null : tokens[p]);
  }
  results.push(entry);
}

// ---------------------------------------------------------------------------
// Anomalies
// ---------------------------------------------------------------------------
const flags = [];
for (const r of results) {
  if (r.skipped) {
    flags.push({ path: r.path, kind: 'skipped', note: r.skipped });
    continue;
  }
  const gated = r.permissions.length || r.anyPermissions.length || r.guards.length;
  for (const [who, res] of Object.entries(r.by)) {
    if (res.status >= 500 || res.status === 0) flags.push({ path: r.url, who, kind: 'server-error', status: res.status, note: res.excerpt });
    if (res.ms > SLOW_MS) flags.push({ path: r.url, who, kind: 'slow', status: res.status, note: `${res.ms} ms` });
  }
  const anon = r.by.anon;
  if (!r.public && anon.status !== 401) flags.push({ path: r.url, who: 'anon', kind: 'auth-not-enforced', status: anon.status, note: anon.excerpt });
  // SCIM is @Public (no JWT) but authenticates with its own SCIM bearer token.
  if (r.public && anon.status === 401 && !r.path.startsWith('/scim/v2/')) flags.push({ path: r.url, who: 'anon', kind: 'public-route-requires-auth', status: 401 });
  const admin = r.by.admin;
  if (admin.status >= 400 && admin.status < 500 && !r.public)
    flags.push({ path: r.url, who: 'admin', kind: 'admin-4xx', status: admin.status, note: admin.excerpt });
  // Permission enforcement vs the persona's effective capabilities.
  const route = gets.find((g) => g.path === r.path);
  const bypassable = route.decorators.some((d) => d === 'OwnerOverride' || d === 'RequireResourceAccess');
  if ((r.permissions.length || r.anyPermissions.length) && !r.guards.length) {
    for (const who of ['exec', 'manager', 'contrib']) {
      const prof = profiles[who];
      if (!prof) continue;
      const caps = new Set(prof.capabilities);
      const allowed =
        prof.isAdmin ||
        (r.permissions.every((k) => caps.has(k)) && (!r.anyPermissions.length || r.anyPermissions.some((k) => caps.has(k))));
      const status = r.by[who].status;
      if (!allowed && status >= 200 && status < 300 && !bypassable)
        flags.push({ path: r.url, who, kind: 'permission-not-enforced', status, note: `needs ${[...r.permissions, ...r.anyPermissions.map((k) => `any:${k}`)].join(',')}` });
      if (allowed && status === 403)
        flags.push({ path: r.url, who, kind: 'unexpected-403', status, note: r.by[who].excerpt });
    }
  }
  if (!gated && !r.public) {
    for (const who of ['exec', 'manager', 'contrib']) {
      if (r.by[who].status === 403) flags.push({ path: r.url, who, kind: 'ungated-route-403', status: 403 });
    }
  }
}

const out = {
  generatedAt: new Date().toISOString(),
  apiUrl: API_URL,
  personas: PERSONAS.map((p) => ({
    ...p,
    meStatus: meByPersona[p.key],
    isAdmin: profiles[p.key]?.isAdmin,
    capabilities: profiles[p.key]?.capabilities,
  })),
  embedTokenMinted: Boolean(ctx.embedToken),
  totals: {
    routes: gets.length,
    swept: results.filter((r) => !r.skipped).length,
    requests: results.reduce((n, r) => n + Object.keys(r.by).length, 0),
  },
  flags,
  results,
};
await writeFile(join(REPO_ROOT, 'docs', 'audit', 'api-sweep.json'), `${JSON.stringify(out, null, 2)}\n`);

console.log(`swept ${out.totals.swept}/${out.totals.routes} GET routes · ${out.totals.requests} requests · embed token ${out.embedTokenMinted ? 'ok' : 'NOT minted'}`);
const byKind = Object.groupBy(flags, (f) => f.kind);
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n## ${kind} (${list.length})`);
  for (const f of list) console.log(`  ${String(f.status ?? '').padEnd(4)} ${(f.who ?? '').padEnd(8)} ${f.path}  ${(f.note ?? '').replace(/\s+/g, ' ').slice(0, 140)}`);
}
