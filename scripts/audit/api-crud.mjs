#!/usr/bin/env node
/**
 * Live write-side (mutation) audit of apps/api (audit tooling).
 *
 * Registers two disposable orgs — A (scenarios run here) and B (cross-tenant
 * probes) — and walks create → read → update → delete cycles per domain, plus
 * invalid-payload and cross-tenant checks. `helios` is never touched.
 * Writes docs/audit/api-crud.json and prints every unexpected result.
 *
 *   node --env-file=.env scripts/audit/api-crud.mjs [domain ...]
 *
 * Each step declares the statuses it expects; anything else is a finding to
 * triage (it may be a harness payload mistake — read the excerpt).
 */

import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const MAILHOG_URL = process.env.MAILHOG_URL ?? 'http://127.0.0.1:8025';
const RUN = Date.now().toString(36);
const OK = [200, 201, 204];

/** Mask secret-looking JSON fields before anything is written to the committed report. */
const SECRET_FIELD = /"(token|secret|signingSecret|apiKey|key|plaintext|password|accessToken|refreshToken|inviteToken|hashedKey)"s*:s*"[^"]*"/g;
const redact = (s) => String(s).replace(SECRET_FIELD, '"$1":"<redacted>"');


const results = [];
let currentDomain = 'setup';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
async function http(method, path, { token, body, headers = {} } = {}) {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  let res;
  let text;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      ctrl.abort(); // SSE never ends — the open stream itself is the result
      text = '[event-stream]';
    } else {
      text = await res.text();
    }
  } catch (err) {
    return { status: 0, json: undefined, text: `request failed: ${err?.name ?? err}`, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text, ms: Math.round(performance.now() - started) };
}

/**
 * One audited call. `expect` lists acceptable statuses (default 2xx).
 * Returns the parsed body (or undefined) so scenarios can chain IDs.
 */
async function step(name, method, path, { token, body, expect = OK, headers } = {}) {
  const r = await http(method, path, { token, body, headers });
  const ok = expect.includes(r.status);
  results.push({
    domain: currentDomain,
    name,
    method,
    path,
    status: r.status,
    expect,
    ok,
    ms: r.ms,
    excerpt: ok ? undefined : redact(r.text.slice(0, 400)),
  });
  return r.json;
}

/** Invalid payload → expect a 400 with a structured error, never a 500. */
const invalid = (name, method, path, token, body) => step(`${name} (invalid payload → 400)`, method, path, { token, body, expect: [400, 422] });

/** Org B must not see/alter org A's resource. */
const foreign = (name, method, path, body) =>
  step(`${name} (cross-tenant → 403/404)`, method, path, { token: B.token, body, expect: [403, 404] });

function domain(name) {
  currentDomain = name;
}

const idOf = (x) => x?.id ?? x?.item?.id ?? x?.data?.id;
const itemsOf = (x) => (Array.isArray(x) ? x : x?.items ?? x?.data ?? []);

async function registerOrg(tag) {
  const slug = `audit-${tag}-${RUN}`;
  const email = `owner-${tag}-${RUN}@audit.test`;
  const password = 'AuditPass123!';
  const reg = await step(`register org ${tag}`, 'POST', '/auth/register', {
    body: { orgName: `Audit ${tag.toUpperCase()} ${RUN}`, slug, adminEmail: email, adminPassword: password, adminFullName: `Audit Owner ${tag}` },
  });
  const login = await http('POST', '/auth/login', { body: { email, password } });
  const token = login.json?.accessToken ?? reg?.accessToken;
  if (!token) throw new Error(`could not obtain a token for org ${tag}: ${login.text}`);
  const me = (await http('GET', '/auth/me', { token })).json;
  return { slug, email, password, token, refreshToken: login.json?.refreshToken, userId: me.user.id, orgId: me.user.organizationId, roleId: me.user.roleId };
}

/**
 * Throwaway HTTP listener on 127.0.0.1 — stands in for "an internal service".
 * Records every request; GET returns a small JSON doc a REST connector can read.
 */
async function startListener() {
  const hits = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, headers: req.headers, body: body.slice(0, 2000), at: Date.now() });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { secret: 'internal-only', value: 4242 } }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, hits, close: () => server.close() };
}

async function waitFor(fn, { timeoutMs = 20_000, everyMs = 500 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return undefined;
}

/** Record a pass/fail observation that isn't a single HTTP call. */
function check(name, ok, status, expect, excerpt) {
  results.push({ domain: currentDomain, name, ok: Boolean(ok), status, expect, excerpt: ok ? undefined : excerpt });
}

async function mailhogTokenFor(email, pattern) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(email)}`).catch(() => null);
    const data = res?.ok ? await res.json() : null;
    for (const m of data?.items ?? []) {
      const raw = (m.Content?.Body ?? '').replace(/=\r?\n/g, '').replace(/=3D/g, '=');
      const hit = raw.match(pattern);
      if (hit) return hit[1];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------
let A;
let B;
const ctx = {}; // ids shared across domains

const scenarios = {
  async identity() {
    domain('identity');
    const T = A.token;
    await invalid('register', 'POST', '/auth/register', undefined, { orgName: 'x' });
    await step('login wrong password → 401', 'POST', '/auth/login', { body: { email: A.email, password: 'nope-nope' }, expect: [401] });
    await step('refresh token', 'POST', '/auth/refresh', { body: { refreshToken: A.refreshToken } });
    await step('refresh token reuse → 401', 'POST', '/auth/refresh', { body: { refreshToken: A.refreshToken }, expect: [401] });
    // reuse detection may revoke the family — get a fresh session for the rest of the run
    A.token = (await http('POST', '/auth/login', { body: { email: A.email, password: A.password } })).json.accessToken;

    await step('PATCH /auth/me', 'PATCH', '/auth/me', { token: A.token, body: { fullName: 'Audit Owner Renamed' } });
    await step('PATCH /auth/me/notification-settings', 'PATCH', '/auth/me/notification-settings', { token: A.token, body: { emailDigest: 'DAILY' }, expect: [200, 201, 204, 400] });
    await step('PATCH /organizations/me', 'PATCH', '/organizations/me', { token: A.token, body: { industry: 'Software', timezone: 'Asia/Karachi', primaryColor: '#123456' } });
    await invalid('PATCH /organizations/me', 'PATCH', '/organizations/me', A.token, { primaryColor: 'blue' });

    // Roles
    const role = await step('create role', 'POST', '/roles', { token: A.token, body: { name: `Audit Role ${RUN}`, permissions: ['KPI_VIEW', 'DASHBOARD_VIEW'] } });
    ctx.roleId = idOf(role);
    await invalid('create role', 'POST', '/roles', A.token, { name: 'x', permissions: ['NOT_A_PERMISSION'] });
    await step('get role', 'GET', `/roles/${ctx.roleId}`, { token: A.token });
    await step('update role', 'PATCH', `/roles/${ctx.roleId}`, { token: A.token, body: { description: 'audit', permissions: ['KPI_VIEW', 'DASHBOARD_VIEW', 'REPORTS_VIEW'] } });
    await step('update role scopeConfig', 'PATCH', `/roles/${ctx.roleId}`, { token: A.token, body: { scopeConfig: { KPIS: 'SELF' } } });
    await step('apply preset', 'POST', `/roles/${ctx.roleId}/apply-preset`, { token: A.token, body: { preset: 'KPI_MANAGER' }, expect: [200, 201, 400] });
    await foreign('get role', 'GET', `/roles/${ctx.roleId}`);
    await foreign('update role', 'PATCH', `/roles/${ctx.roleId}`, { description: 'pwned' });

    // Positions
    const pos = await step('create position', 'POST', '/positions', { token: A.token, body: { name: `Audit Analyst ${RUN}`, level: 2, track: 'IC' } });
    ctx.positionId = idOf(pos);
    await invalid('create position', 'POST', '/positions', A.token, { name: 'x', track: 'WIZARD' });
    await step('update position', 'PATCH', `/positions/${ctx.positionId}`, { token: A.token, body: { payGrade: 'P2' } });
    await foreign('update position', 'PATCH', `/positions/${ctx.positionId}`, { payGrade: 'X' });

    // Users — invite → email → preview → accept → login
    const inviteEmail = `invitee-${RUN}@audit.test`;
    const invited = await step('invite user', 'POST', '/users', { token: A.token, body: { email: inviteEmail, fullName: 'Audit Invitee', roleId: ctx.roleId, positionId: ctx.positionId } });
    ctx.userId = idOf(invited) ?? invited?.user?.id;
    await invalid('invite user', 'POST', '/users', A.token, { email: 'not-an-email', fullName: 'x' });
    await step('invite duplicate email → 409', 'POST', '/users', { token: A.token, body: { email: inviteEmail, fullName: 'Audit Invitee' }, expect: [409, 400] });
    const mailed = await mailhogTokenFor(inviteEmail, /[?&]token=([A-Za-z0-9._~-]+)/);
    results.push({ domain: 'identity', name: 'invitation email delivered to Mailhog (known gap BE-008)', ok: Boolean(mailed), status: mailed ? 'found' : 'missing', expect: ['found'] });
    // Non-production API returns the token on the response — use it to exercise the accept flow.
    const inviteToken = mailed ?? invited?.inviteToken;
    if (inviteToken) {
      await step('invitation preview', 'POST', '/auth/invitation-preview', { body: { token: inviteToken } });
      await step('accept invitation', 'POST', '/auth/accept-invitation', { body: { token: inviteToken, password: 'InviteePass123!' } });
      await step('accept invitation twice → 4xx', 'POST', '/auth/accept-invitation', { body: { token: inviteToken, password: 'InviteePass123!' }, expect: [400, 401, 404, 409, 410] });
      const inv = await http('POST', '/auth/login', { body: { email: inviteEmail, password: 'InviteePass123!' } });
      results.push({ domain: 'identity', name: 'invitee can log in', ok: inv.status === 200, status: inv.status, expect: [200], excerpt: inv.status === 200 ? undefined : inv.text.slice(0, 300) });
      ctx.inviteeToken = inv.json?.accessToken;
      if (ctx.inviteeToken) {
        await step('invitee (KPI_VIEW only) cannot create role → 403', 'POST', '/roles', { token: ctx.inviteeToken, body: { name: 'Nope', permissions: [] }, expect: [403] });
        await step('invitee change password', 'POST', '/auth/me/change-password', { token: ctx.inviteeToken, body: { currentPassword: 'InviteePass123!', newPassword: 'InviteePass456!' } });
      }
    }
    if (ctx.userId) {
      await step('get user', 'GET', `/users/${ctx.userId}`, { token: A.token });
      await foreign('get user', 'GET', `/users/${ctx.userId}`);
      await step('put access-override', 'PUT', `/users/${ctx.userId}/access-override`, { token: A.token, body: { grantCapabilities: ['REPORTS_VIEW'], revokeCapabilities: [] } });
      await step('get access-profile reflects override', 'GET', `/users/${ctx.userId}/access-profile`, { token: A.token });
      await step('delete access-override', 'DELETE', `/users/${ctx.userId}/access-override`, { token: A.token });
      await step('suspend user', 'POST', `/users/${ctx.userId}/suspend`, { token: A.token, body: {} });
      const susp = await http('POST', '/auth/login', { body: { email: inviteEmail, password: 'InviteePass456!' } });
      results.push({ domain: 'identity', name: 'suspended user cannot log in', ok: susp.status === 401 || susp.status === 403, status: susp.status, expect: [401, 403] });
      if (ctx.inviteeToken) {
        const still = await http('GET', '/auth/me', { token: ctx.inviteeToken });
        results.push({ domain: 'identity', name: "suspended user's existing access token is rejected", ok: still.status === 401 || still.status === 403, status: still.status, expect: [401, 403] });
      }
      await step('reactivate user', 'POST', `/users/${ctx.userId}/reactivate`, { token: A.token, body: {} });
      await foreign('suspend user', 'POST', `/users/${ctx.userId}/suspend`, {});
    }

    // Permission delegations + resource permissions
    if (ctx.userId) {
      const now = Date.now();
      const del = await step('create delegation', 'POST', '/permission-delegations', {
        token: A.token,
        body: { grantorUserId: A.userId, granteeUserId: ctx.userId, permissions: ['REPORTS_VIEW'], validFrom: new Date(now).toISOString(), validTo: new Date(now + 864e5).toISOString() },
      });
      await invalid('create delegation (validTo < validFrom)', 'POST', '/permission-delegations', A.token, { grantorUserId: A.userId, granteeUserId: ctx.userId, validFrom: new Date(now).toISOString(), validTo: new Date(now - 1000).toISOString() });
      if (idOf(del)) await step('delete delegation', 'DELETE', `/permission-delegations/${idOf(del)}`, { token: A.token });
    }

    // MFA enrol (confirm needs a TOTP code — enrol + disable without code are probed)
    await step('mfa enroll', 'POST', '/mfa/enroll', { token: A.token, body: {} });
    await step('mfa confirm with bad code → 400/401', 'POST', '/mfa/confirm', { token: A.token, body: { code: '000000' }, expect: [400, 401] });

    // Sessions
    await step('list sessions', 'GET', '/me/sessions', { token: A.token });

    // Password reset request (always 200/202/204 to avoid user enumeration)
    await step('request password reset (known email)', 'POST', '/auth/password/request-reset', { body: { email: A.email } });
    await step('request password reset (unknown email) — same status', 'POST', '/auth/password/request-reset', { body: { email: `nobody-${RUN}@audit.test` } });
    await step('confirm reset with bogus token → 4xx', 'POST', '/auth/password/confirm-reset', { body: { token: 'bogus', newPassword: 'Whatever123!' }, expect: [400, 401, 404, 410] });
  },

  async org() {
    domain('org');
    const T = A.token;
    const type = await step('create org-unit type', 'POST', '/org-unit-types', { token: T, body: { name: `Department ${RUN}`, namePlural: `Departments ${RUN}` } });
    ctx.unitTypeId = idOf(type);
    const dim = await step('create org-unit dimension', 'POST', '/org-unit-dimensions', { token: T, body: { name: `Region ${RUN}` } });
    const parent = await step('create org unit', 'POST', '/org-units', { token: T, body: { name: `Audit Parent ${RUN}`, orgUnitTypeId: ctx.unitTypeId } });
    ctx.unitId = idOf(parent);
    const child = await step('create child unit', 'POST', '/org-units', { token: T, body: { name: `Audit Child ${RUN}`, parentUnitId: ctx.unitId } });
    ctx.childUnitId = idOf(child);
    await invalid('create org unit', 'POST', '/org-units', T, { name: 'x', status: 'EXPLODED' });
    await step('create unit with foreign parent → 4xx', 'POST', '/org-units', { token: B.token, body: { name: 'Sneaky', parentUnitId: ctx.unitId }, expect: [400, 403, 404] });
    await step('update unit', 'PATCH', `/org-units/${ctx.unitId}`, { token: T, body: { description: 'audit' } });
    await step('cycle: make parent a child of its child → 4xx', 'PATCH', `/org-units/${ctx.unitId}`, { token: T, body: { parentUnitId: ctx.childUnitId }, expect: [400, 409, 422] });
    await step('rename unit', 'POST', `/org-units/${ctx.unitId}/rename`, { token: T, body: { name: `Audit Parent Renamed ${RUN}` } });
    await step('name history', 'GET', `/org-units/${ctx.unitId}/name-history`, { token: T });
    if (ctx.userId) {
      await step('add member', 'POST', `/org-units/${ctx.unitId}/members`, { token: T, body: { userId: ctx.userId, memberRole: 'MEMBER' } });
      await step('add member twice → 409/200', 'POST', `/org-units/${ctx.unitId}/members`, { token: T, body: { userId: ctx.userId }, expect: [200, 201, 409] });
      await step('move users', 'POST', '/org-units/move-users', { token: T, body: { userIds: [ctx.userId], fromUnitId: ctx.unitId, toUnitId: ctx.childUnitId } });
      await step('memberships by user', 'GET', `/org-units/by-user/${ctx.userId}/memberships`, { token: T });
    }
    const split = await step('split unit', 'POST', `/org-units/${ctx.childUnitId}/split`, { token: T, body: { newUnitName: `Audit Split ${RUN}`, memberUserIds: [] } });
    const splitId = idOf(split) ?? split?.newUnit?.id;
    if (splitId) await step('merge split back', 'POST', `/org-units/${splitId}/merge-into`, { token: T, body: { targetId: ctx.childUnitId } });
    await foreign('get unit', 'GET', `/org-units/${ctx.unitId}`);
    await foreign('delete unit', 'DELETE', `/org-units/${ctx.unitId}`);
    await step('update unit type', 'PATCH', `/org-unit-types/${ctx.unitTypeId}`, { token: T, body: { name: `Dept ${RUN}` } });
    if (idOf(dim)) {
      await step('update dimension', 'PATCH', `/org-unit-dimensions/${idOf(dim)}`, { token: T, body: { name: `Region2 ${RUN}` } });
      await step('delete dimension', 'DELETE', `/org-unit-dimensions/${idOf(dim)}`, { token: T });
    }
    await step('org templates list', 'GET', '/org-templates', { token: T });
    await step('org template preview (public)', 'POST', '/org-templates/preview', { body: { slug: 'tech-starter' }, expect: [200, 201, 400] });
  },

  async kpi() {
    domain('kpi');
    const T = A.token;
    const day = (d) => new Date(Date.now() - d * 864e5).toISOString();

    const cat = await step('create category', 'POST', '/kpi-categories', { token: T, body: { name: `Audit Finance ${RUN}`, color: '#336699' } });
    ctx.categoryId = idOf(cat);
    await invalid('create category', 'POST', '/kpi-categories', T, { name: 'x', bogus: true });
    await step('update category', 'PATCH', `/kpi-categories/${ctx.categoryId}`, { token: T, body: { description: 'audit' } });

    const kpi = await step('create ORG_WIDE KPI', 'POST', '/kpis', {
      token: T,
      body: { name: `Audit Revenue ${RUN}`, unit: 'USD', categoryId: ctx.categoryId, type: 'CURRENCY', targetValue: 1000, direction: 'HIGHER_IS_BETTER' },
    });
    ctx.kpiId = idOf(kpi);
    const kpi2 = await step('create 2nd KPI (cascade child)', 'POST', '/kpis', { token: T, body: { name: `Audit Child Revenue ${RUN}`, unit: 'USD' } });
    ctx.kpi2Id = idOf(kpi2);
    await invalid('create KPI', 'POST', '/kpis', T, { name: 'x', type: 'BANANAS' });
    await step('PER_UNIT KPI without orgUnitIds → 400', 'POST', '/kpis', { token: T, body: { name: `Bad Unit KPI ${RUN}`, scope: 'PER_UNIT' }, expect: [400, 422] });
    await step('KPI with foreign category → 4xx', 'POST', '/kpis', { token: B.token, body: { name: `Sneaky ${RUN}`, categoryId: ctx.categoryId }, expect: [400, 403, 404] });
    if (ctx.unitId) {
      const uk = await step('create PER_UNIT KPI', 'POST', '/kpis', { token: T, body: { name: `Audit Unit KPI ${RUN}`, scope: 'PER_UNIT', orgUnitIds: [ctx.unitId] } });
      ctx.unitKpiId = idOf(uk);
      if (ctx.unitKpiId)
        await step('PER_UNIT data via org-wide endpoint → 422', 'POST', `/kpis/${ctx.unitKpiId}/data`, { token: T, body: { value: 5, periodStart: day(2), periodEnd: day(1) }, expect: [400, 422] });
    }
    await step('get KPI', 'GET', `/kpis/${ctx.kpiId}`, { token: T });
    await step('update KPI', 'PATCH', `/kpis/${ctx.kpiId}`, { token: T, body: { description: 'audited' } });
    await step('transition DRAFT → ACTIVE', 'POST', `/kpis/${ctx.kpiId}/transition`, { token: T, body: { to: 'ACTIVE', reason: 'audit' } });
    await step('versions', 'GET', `/kpis/${ctx.kpiId}/versions`, { token: T });
    await foreign('get KPI', 'GET', `/kpis/${ctx.kpiId}`);
    await foreign('update KPI', 'PATCH', `/kpis/${ctx.kpiId}`, { description: 'pwned' });

    // Data points
    for (let i = 10; i >= 1; i--) {
      await step(`record data point d-${i}`, 'POST', `/kpis/${ctx.kpiId}/data`, { token: T, body: { value: 800 + i * 7 + (i % 3) * 15, periodStart: day(i + 1), periodEnd: day(i) } });
    }
    await invalid('record data (periodEnd < periodStart)', 'POST', `/kpis/${ctx.kpiId}/data`, T, { value: 1, periodStart: day(1), periodEnd: day(3) });
    await invalid('record data (non-numeric value)', 'POST', `/kpis/${ctx.kpiId}/data`, T, { value: 'lots', periodStart: day(2), periodEnd: day(1) });
    await foreign('record data', 'POST', `/kpis/${ctx.kpiId}/data`, { value: 1, periodStart: day(2), periodEnd: day(1) });
    const data = await step('list data', 'GET', `/kpis/${ctx.kpiId}/data?limit=50`, { token: T });
    results.push({ domain: 'kpi', name: 'list data returns the 10 recorded points', ok: itemsOf(data).length >= 10, status: itemsOf(data).length, expect: ['>=10'] });

    // Targets / thresholds / benchmarks
    const tgt = await step('create target', 'POST', `/kpis/${ctx.kpiId}/targets`, { token: T, body: { type: 'STATIC', value: 1200 } });
    await step('active target', 'GET', `/kpis/${ctx.kpiId}/targets/active`, { token: T });
    if (idOf(tgt)) {
      await step('update target', 'PATCH', `/kpis/${ctx.kpiId}/targets/${idOf(tgt)}`, { token: T, body: { value: 1300 } });
      await step('delete target', 'DELETE', `/kpis/${ctx.kpiId}/targets/${idOf(tgt)}`, { token: T });
    }
    await invalid('create target', 'POST', `/kpis/${ctx.kpiId}/targets`, T, { type: 'TELEPATHIC' });
    const band = await step('create threshold band', 'POST', `/kpis/${ctx.kpiId}/threshold-bands`, { token: T, body: { name: 'Red', lower: null, upper: 500, color: '#ff0000', order: 0 } });
    await step('threshold status', 'GET', `/kpis/${ctx.kpiId}/threshold-bands/status`, { token: T });
    if (idOf(band)) {
      await step('update band', 'PATCH', `/kpis/${ctx.kpiId}/threshold-bands/${idOf(band)}`, { token: T, body: { upper: 600 } });
      await step('delete band', 'DELETE', `/kpis/${ctx.kpiId}/threshold-bands/${idOf(band)}`, { token: T });
    }
    await step('band with lower > upper → 400', 'POST', `/kpis/${ctx.kpiId}/threshold-bands`, { token: T, body: { name: 'Bad', lower: 900, upper: 100, color: '#000000', order: 1 }, expect: [400, 422] });
    const bm = await step('create benchmark', 'POST', `/kpis/${ctx.kpiId}/benchmarks`, { token: T, body: { kind: 'EXTERNAL_INDUSTRY', value: 950, source: 'Audit' } });
    await step('compute benchmark', 'POST', `/kpis/${ctx.kpiId}/benchmarks/compute`, { token: T, body: { days: 30 } });
    if (idOf(bm)) await step('delete benchmark', 'DELETE', `/kpis/${ctx.kpiId}/benchmarks/${idOf(bm)}`, { token: T });

    // Formula (incl. sandbox escape attempts)
    await step('attach formula', 'PUT', `/kpis/${ctx.kpi2Id}/formula`, { token: T, body: { raw: '1 + 2 * 3' }, expect: [200, 201, 400] });
    for (const raw of ["constructor.constructor('return process')().exit()", "this.constructor.constructor('return globalThis')()", "require('fs')", 'while(true){}']) {
      await step(`formula sandbox rejects: ${raw.slice(0, 40)}`, 'PUT', `/kpis/${ctx.kpi2Id}/formula`, { token: T, body: { raw }, expect: [400, 422] });
    }
    const health = await http('GET', '/health');
    results.push({ domain: 'kpi', name: 'API still healthy after sandbox probes', ok: health.status === 200, status: health.status, expect: [200] });
    await step('get formula', 'GET', `/kpis/${ctx.kpi2Id}/formula`, { token: T, expect: [200, 404] });
    await step('recompute', 'POST', `/kpis/${ctx.kpi2Id}/recompute`, { token: T, body: {} });
    await step('delete formula', 'DELETE', `/kpis/${ctx.kpi2Id}/formula`, { token: T, expect: [200, 204, 404] });

    // Cascades + lineage
    const cas = await step('attach cascade', 'POST', '/kpi-cascades', { token: T, body: { parentKpiId: ctx.kpiId, childKpiId: ctx.kpi2Id, method: 'SUM' } });
    await step('cascade cycle (child → parent) → 4xx', 'POST', '/kpi-cascades', { token: T, body: { parentKpiId: ctx.kpi2Id, childKpiId: ctx.kpiId }, expect: [400, 409, 422] });
    await step('cascade self-loop → 4xx', 'POST', '/kpi-cascades', { token: T, body: { parentKpiId: ctx.kpiId, childKpiId: ctx.kpiId }, expect: [400, 409, 422] });
    await step('cascade with foreign KPI → 4xx', 'POST', '/kpi-cascades', { token: B.token, body: { parentKpiId: ctx.kpiId, childKpiId: ctx.kpi2Id }, expect: [400, 403, 404] });
    await step('rollup', 'POST', `/kpis/${ctx.kpiId}/rollup`, { token: T, body: {} });
    await step('lineage upstream', 'GET', `/lineage/kpi/${ctx.kpiId}/upstream`, { token: T });
    if (idOf(cas)) await step('detach cascade', 'DELETE', `/kpi-cascades/${idOf(cas)}`, { token: T });

    // Analytics on the series (ML sidecar)
    await step('anomaly detect', 'POST', `/kpis/${ctx.kpiId}/anomalies/detect`, { token: T, body: {} });
    await step('forecast', 'POST', `/kpis/${ctx.kpiId}/forecasts`, { token: T, body: { horizon: 5, model: 'naive' } });
    await step('what-if', 'POST', `/kpis/${ctx.kpiId}/whatif`, { token: T, body: { adjustments: [{ type: 'percent', value: 10 }] }, expect: [200, 201, 400] });
    await step('seasonality', 'POST', `/kpis/${ctx.kpiId}/seasonality`, { token: T, body: {}, expect: [200, 201, 400, 422] });

    // Templates + import
    await step('list templates', 'GET', '/kpi-templates', { token: T });
    await step('import dry-run', 'POST', '/kpis/import/dry-run', { token: T, body: { csv: `name,unit\nImported ${RUN},USD\n` }, expect: [200, 201, 400] });

    // Lifecycle: archive → restore → archive → purge
    await step('archive KPI 2', 'DELETE', `/kpis/${ctx.kpi2Id}`, { token: T });
    await step('restore KPI 2', 'POST', `/kpis/${ctx.kpi2Id}/restore`, { token: T, body: {} });
    await step('archive KPI 2 again', 'DELETE', `/kpis/${ctx.kpi2Id}`, { token: T });
    await foreign('purge KPI 2', 'DELETE', `/kpis/${ctx.kpi2Id}/purge`);
    await step('purge KPI 2', 'DELETE', `/kpis/${ctx.kpi2Id}/purge`, { token: T });
    await step('get purged KPI → 404', 'GET', `/kpis/${ctx.kpi2Id}`, { token: T, expect: [404] });
  },

  async viz() {
    domain('viz');
    const T = A.token;
    const dash = await step('create dashboard', 'POST', '/dashboards', { token: T, body: { name: `Audit Dash ${RUN}`, isShared: true } });
    ctx.dashId = idOf(dash);
    await invalid('create dashboard', 'POST', '/dashboards', T, { name: 'x', colour: 'red' });
    const w = await step('add widget', 'POST', `/dashboards/${ctx.dashId}/widgets`, {
      token: T,
      body: { widgetType: 'line', title: 'Revenue', config: { kpiIds: [ctx.kpiId] }, position: { x: 0, y: 0, w: 6, h: 4 } },
    });
    await invalid('add widget (x out of grid)', 'POST', `/dashboards/${ctx.dashId}/widgets`, T, { widgetType: 'line', config: {}, position: { x: 40, y: 0, w: 6, h: 4 } });
    await step('widget referencing foreign KPI → 4xx', 'POST', `/dashboards/${ctx.dashId}/widgets`, {
      token: T,
      body: { widgetType: 'kpi_card', config: { kpiId: 'cmure3474007vhi4c6htru75t' }, position: { x: 6, y: 0, w: 3, h: 2 } },
      expect: [400, 403, 404],
    });
    if (idOf(w)) {
      await step('update widget', 'PATCH', `/dashboards/${ctx.dashId}/widgets/${idOf(w)}`, { token: T, body: { title: 'Revenue (audit)' } });
      await step('move widget', 'POST', `/dashboards/${ctx.dashId}/widgets/${idOf(w)}/position`, { token: T, body: { x: 6, y: 0, w: 6, h: 4 } });
    }
    await step('update dashboard', 'PATCH', `/dashboards/${ctx.dashId}`, { token: T, body: { description: 'audit' } });
    await step('set default', 'POST', `/dashboards/${ctx.dashId}/set-default`, { token: T, body: {} });
    const snap = await step('capture snapshot', 'POST', `/dashboards/${ctx.dashId}/snapshots`, { token: T, body: { label: 'audit' } });
    if (idOf(snap)) await step('get snapshot', 'GET', `/dashboards/snapshots/${idOf(snap)}`, { token: T });
    const share = await step('create share link', 'POST', `/dashboards/${ctx.dashId}/share`, { token: T, body: {} });
    const token = share?.token;
    if (token) {
      await step('public share resolves (no auth)', 'GET', `/public/dashboards/${token}`);
      await step('revoke share link', 'DELETE', `/dashboards/share/${idOf(share)}`, { token: T });
      await step('revoked share → 404/410', 'GET', `/public/dashboards/${token}`, { expect: [401, 403, 404, 410] });
    }
    const pw = await step('create password-protected share', 'POST', `/dashboards/${ctx.dashId}/share`, { token: T, body: { password: 'SharePass123' }, expect: [200, 201, 400] });
    if (pw?.token) {
      await step('protected share without password → 401/403', 'GET', `/public/dashboards/${pw.token}`, { expect: [401, 403] });
      await step('protected share wrong password → 401/403', 'POST', `/public/dashboards/${pw.token}`, { body: { password: 'nope' }, expect: [401, 403] });
      await step('protected share right password', 'POST', `/public/dashboards/${pw.token}`, { body: { password: 'SharePass123' } });
    }
    if (ctx.unitId) {
      await step('assign dashboard to unit', 'POST', `/dashboards/${ctx.dashId}/unit-assignments`, { token: T, body: { orgUnitId: ctx.unitId } });
      await step('unassign', 'DELETE', `/dashboards/${ctx.dashId}/unit-assignments/${ctx.unitId}`, { token: T });
    }
    await foreign('get dashboard', 'GET', `/dashboards/${ctx.dashId}`);
    await foreign('add widget', 'POST', `/dashboards/${ctx.dashId}/widgets`, { widgetType: 'number', config: {}, position: { x: 0, y: 0, w: 2, h: 2 } });

    // Reports
    for (const format of ['CSV', 'EXCEL', 'PDF']) {
      await step(`generate ${format} report`, 'POST', '/reports/generate', { token: T, body: { format, kpiIds: [ctx.kpiId] } });
    }
    await step('board pack', 'GET', '/reports/board-pack?sinceDays=30', { token: T });
    const sr = await step('create scheduled report', 'POST', '/scheduled-reports', {
      token: T,
      body: { name: `Audit Weekly ${RUN}`, kpiIds: [ctx.kpiId], cron: '0 8 * * 1', format: 'PDF', recipients: [`report-${RUN}@audit.test`] },
    });
    await invalid('scheduled report with bad cron', 'POST', '/scheduled-reports', T, { name: 'x', cron: 'every tuesday', format: 'PDF', recipients: ['a@b.co'] });
    if (idOf(sr)) {
      await step('update scheduled report', 'PATCH', `/scheduled-reports/${idOf(sr)}`, { token: T, body: { description: 'audit' } });
      await step('trigger scheduled report', 'POST', `/scheduled-reports/${idOf(sr)}/trigger`, { token: T, body: {} });
      const mail = await waitFor(async () => {
        const r = await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(`report-${RUN}@audit.test`)}`).catch(() => null);
        const d = r?.ok ? await r.json() : null;
        return d?.total > 0 ? d : undefined;
      }, { timeoutMs: 45_000 });
      check('triggered report emailed (Mailhog) within 45 s', mail, mail ? 'delivered' : 'not delivered', ['delivered']);
      await step('delete scheduled report', 'DELETE', `/scheduled-reports/${idOf(sr)}`, { token: T });
    }
    await step('search', 'GET', `/search?q=${encodeURIComponent('Audit Revenue')}`, { token: T });
    await step('realtime SSE opens', 'GET', '/realtime/stream', { token: T, expect: [200] }).catch(() => undefined);

    // Archive lifecycle
    const d2 = await step('create 2nd dashboard', 'POST', '/dashboards', { token: T, body: { name: `Audit Dash 2 ${RUN}` } });
    if (idOf(d2)) {
      await step('archive dashboard', 'DELETE', `/dashboards/${idOf(d2)}`, { token: T });
      await step('restore dashboard', 'POST', `/dashboards/${idOf(d2)}/restore`, { token: T, body: {} });
      await step('archive again', 'DELETE', `/dashboards/${idOf(d2)}`, { token: T });
      await step('purge dashboard', 'DELETE', `/dashboards/${idOf(d2)}/purge`, { token: T });
    }
  },

  async alerting() {
    domain('alerting');
    const T = A.token;
    const listener = await startListener();
    try {
      // Channels — WEBHOOK to an internal address (SSRF probe) + EMAIL
      const wh = await step('create WEBHOOK channel → internal 127.0.0.1 URL', 'POST', '/notification-channels', { token: T, body: { name: `Internal hook ${RUN}`, kind: 'WEBHOOK', config: { url: `${listener.url}/hook` } } });
      check('channel creation rejects internal/loopback URL (SSRF guard)', !idOf(wh), idOf(wh) ? 'accepted' : 'rejected', ['rejected']);
      const em = await step('create EMAIL channel', 'POST', '/notification-channels', { token: T, body: { name: `Email ${RUN}`, kind: 'EMAIL', config: { recipients: [`alerts-${RUN}@audit.test`] } } });
      await invalid('create channel (bad kind)', 'POST', '/notification-channels', T, { name: 'Pigeon', kind: 'PIGEON' });
      if (idOf(wh)) {
        await step('test WEBHOOK channel', 'POST', `/notification-channels/${idOf(wh)}/test`, { token: T, body: {} });
        const hit = await waitFor(() => listener.hits.find((h) => h.url === '/hook'), { timeoutMs: 15_000 });
        check('API delivered to internal 127.0.0.1 listener (SSRF)', !hit, hit ? 'reached internal host' : 'not reached', ['not reached']);
      }
      await step('update channel', 'PATCH', `/notification-channels/${idOf(em)}`, { token: T, body: { name: `Email2 ${RUN}` } });
      await foreign('update channel', 'PATCH', `/notification-channels/${idOf(em)}`, { name: 'pwned' });

      // Rule → breaching data point → alert → email
      const rule = await step('create STATIC_THRESHOLD rule', 'POST', '/alert-rules', {
        token: T,
        body: {
          ruleType: 'STATIC_THRESHOLD',
          kpiId: ctx.kpiId,
          name: `Audit <b>Revenue</b> spike ${RUN}`,
          severity: 'HIGH',
          config: { operator: '>', value: 5000, cooldownMinutes: 0 },
          escalationLevels: [{ delayMinutes: 0, channelIds: [idOf(em), idOf(wh)].filter(Boolean) }],
        },
      });
      ctx.ruleId = idOf(rule);
      await invalid('create rule (config mismatch)', 'POST', '/alert-rules', T, { ruleType: 'STATIC_THRESHOLD', kpiId: ctx.kpiId, name: 'Bad', config: { sigmas: 2 } });
      await step('rule on foreign KPI → 4xx', 'POST', '/alert-rules', { token: B.token, body: { ruleType: 'STATIC_THRESHOLD', kpiId: ctx.kpiId, name: 'Sneaky', config: { operator: '>', value: 1 } }, expect: [400, 403, 404] });
      const before = itemsOf(await step('list alerts (before)', 'GET', '/alerts', { token: T })).length;
      const t0 = Date.now();
      await step('record breaching data point (9999 > 5000)', 'POST', `/kpis/${ctx.kpiId}/data`, { token: T, body: { value: 9999, periodStart: new Date(t0 - 3600e3).toISOString(), periodEnd: new Date(t0).toISOString() } });
      const alert = await waitFor(async () => {
        const list = itemsOf((await http('GET', '/alerts', { token: T })).json);
        return list.length > before ? list[0] : undefined;
      });
      check('alert raised within 20 s of breaching data point', alert, alert ? `${Date.now() - t0} ms` : 'no alert', ['alert']);
      if (alert) {
        ctx.alertId = alert.id;
        const mail = await waitFor(async () => {
          const r = await fetch(`${MAILHOG_URL}/api/v2/search?kind=to&query=${encodeURIComponent(`alerts-${RUN}@audit.test`)}`).catch(() => null);
          const d = r?.ok ? await r.json() : null;
          return d?.items?.[0];
        }, { timeoutMs: 30_000 });
        check('alert email delivered to Mailhog', mail, mail ? 'delivered' : 'not delivered', ['delivered']);
        if (mail) {
          const html = (mail.Content?.Body ?? '').replace(/=\r?\n/g, '');
          check('alert email HTML-escapes user-controlled rule/KPI text', !/<b>Revenue<\/b>/.test(html), /<b>Revenue<\/b>/.test(html) ? 'raw <b> injected' : 'escaped', ['escaped']);
        }
        await step('acknowledge alert', 'POST', `/alerts/${alert.id}/acknowledge`, { token: T, body: {} });
        await step('resolve alert', 'POST', `/alerts/${alert.id}/resolve`, { token: T, body: {} });
        await foreign('acknowledge alert', 'POST', `/alerts/${alert.id}/acknowledge`, {});
      }
      await step('update rule', 'PATCH', `/alert-rules/${ctx.ruleId}`, { token: T, body: { isActive: false } });
      await step('delivery list', 'GET', '/notification-deliveries', { token: T, expect: [200, 404] });
      await step('delete rule', 'DELETE', `/alert-rules/${ctx.ruleId}`, { token: T });
      if (idOf(wh)) await step('delete webhook channel', 'DELETE', `/notification-channels/${idOf(wh)}`, { token: T });
    } finally {
      listener.close();
    }
  },

  async ai() {
    domain('ai');
    const T = A.token;
    await step('AI providers', 'GET', '/ai/providers', { token: T });
    await step('AI budget', 'GET', '/ai/budget', { token: T, expect: [200, 404] });
    await step('update AI budget', 'PATCH', '/ai/budget', { token: T, body: { dailyCapUsd: 1, monthlyCapUsd: 10 } });
    await invalid('update AI budget (negative)', 'PATCH', '/ai/budget', T, { dailyCapUsd: -5 });
    await step('NLQ ask', 'POST', '/nlq/ask', { token: T, body: { question: 'What is the latest Audit Revenue value?' }, expect: [200, 201, 429, 503] });
    await invalid('NLQ ask (empty)', 'POST', '/nlq/ask', T, { question: '' });
    await step('generate insight', 'POST', '/insights/generate', { token: T, body: { kpiId: ctx.kpiId }, expect: [200, 201, 429, 503] });
    await step('generate recommendation', 'POST', '/recommendations/generate', { token: T, body: { kpiId: ctx.kpiId }, expect: [200, 201, 429, 503] });
    await step('insight on foreign KPI → 4xx', 'POST', '/insights/generate', { token: B.token, body: { kpiId: ctx.kpiId }, expect: [400, 403, 404] });
    await step('NLQ as org B cannot see org A KPI name', 'POST', '/nlq/ask', { token: B.token, body: { question: `What is the value of Audit Revenue ${RUN}?` }, expect: [200, 201, 429, 503] }).then((r) => {
      const leaked = JSON.stringify(r ?? {}).includes('Audit Revenue');
      check('NLQ answer for org B does not mention org A KPI', !leaked, leaked ? 'leaked' : 'clean', ['clean']);
    });
  },

  async collab() {
    domain('collab');
    const T = A.token;
    const task = await step('create task', 'POST', '/tasks', { token: T, body: { title: `Audit task ${RUN}`, kpiId: ctx.kpiId, assigneeUserId: ctx.userId ?? A.userId, priority: 'HIGH', dueAt: new Date(Date.now() + 864e5).toISOString() } });
    ctx.taskId = idOf(task);
    await invalid('create task', 'POST', '/tasks', T, { title: 'x', priority: 'MEGA' });
    await step('task with foreign KPI → 4xx', 'POST', '/tasks', { token: B.token, body: { title: 'Sneaky task', kpiId: ctx.kpiId }, expect: [400, 403, 404] });
    await step('update task', 'PATCH', `/tasks/${ctx.taskId}`, { token: T, body: { status: 'IN_PROGRESS', description: null } });
    await step('tasks by KPI', 'GET', `/tasks/by-kpi/${ctx.kpiId}`, { token: T });
    await foreign('update task', 'PATCH', `/tasks/${ctx.taskId}`, { status: 'DONE' });

    const c = await step('comment with mention', 'POST', '/comments', { token: T, body: { entityType: 'task', entityId: ctx.taskId, body: `@invitee please check ${RUN}`, mentionedUserIds: [ctx.userId].filter(Boolean) } });
    await step('comment on foreign entity → 4xx', 'POST', '/comments', { token: B.token, body: { entityType: 'task', entityId: ctx.taskId, body: 'hi' }, expect: [400, 403, 404] });
    await step('mention to foreign user → 4xx', 'POST', '/comments', { token: B.token, body: { entityType: 'task', entityId: ctx.taskId, body: 'hi', mentionedUserIds: [A.userId] }, expect: [400, 403, 404] });
    if (idOf(c)) {
      await step('edit comment', 'PATCH', `/comments/${idOf(c)}`, { token: T, body: { body: 'edited' } });
      if (ctx.inviteeToken) await step("other user can't edit my comment → 403", 'PATCH', `/comments/${idOf(c)}`, { token: ctx.inviteeToken, body: { body: 'hijack' }, expect: [403, 404] });
      await step('delete comment', 'DELETE', `/comments/${idOf(c)}`, { token: T });
    }

    const obj = await step('create objective', 'POST', '/objectives', { token: T, body: { name: `Audit Objective ${RUN}`, ownerUserId: A.userId, periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() + 90 * 864e5).toISOString() } });
    ctx.objId = idOf(obj);
    await step('objective with end < start → 400', 'POST', '/objectives', { token: T, body: { name: 'Backwards', ownerUserId: A.userId, periodStart: new Date().toISOString(), periodEnd: new Date(Date.now() - 864e5).toISOString() }, expect: [400, 422] });
    await step('objective as own parent → 400', 'PATCH', `/objectives/${ctx.objId}`, { token: T, body: { parentObjectiveId: ctx.objId }, expect: [400, 409, 422] });
    const kr = await step('create key result', 'POST', `/objectives/${ctx.objId}/key-results`, { token: T, body: { name: 'Revenue KR', kpiId: ctx.kpiId, targetValue: 10000, baselineValue: 800 } });
    await step('sync from linked KPIs', 'POST', `/objectives/${ctx.objId}/sync-from-linked-kpis`, { token: T, body: {} });
    if (idOf(kr)) {
      await step('update KR', 'PATCH', `/objectives/${ctx.objId}/key-results/${idOf(kr)}`, { token: T, body: { weight: 2 } });
      await step('delete KR', 'DELETE', `/objectives/${ctx.objId}/key-results/${idOf(kr)}`, { token: T });
    }
    await foreign('get objective', 'GET', `/objectives/${ctx.objId}`);
    await step('delete objective', 'DELETE', `/objectives/${ctx.objId}`, { token: T });

    await step('upsert approval workflow', 'PUT', '/approvals/workflows/KPI_TARGET', { token: T, body: { requiredApproverRoleIds: [A.roleId], isActive: true } });
    await step('list approval requests', 'GET', '/approvals/requests', { token: T });
    await step('disable approval workflow', 'PUT', '/approvals/workflows/KPI_TARGET', { token: T, body: { requiredApproverRoleIds: [A.roleId], isActive: false } });

    const wf = await step('create workflow', 'POST', '/workflows', { token: T, body: { name: `Audit WF ${RUN}`, triggers: ['manual'], action: { type: 'create_task', title: 'From workflow' } } });
    if (idOf(wf)) {
      await step('trigger workflow', 'POST', `/workflows/${idOf(wf)}/trigger`, { token: T, body: {} });
      await step('update workflow', 'PATCH', `/workflows/${idOf(wf)}`, { token: T, body: { isActive: false } });
      await step('delete workflow', 'DELETE', `/workflows/${idOf(wf)}`, { token: T });
    }
    await step('setup checklist', 'GET', '/setup-checklist', { token: T });
    if (ctx.inviteeToken) {
      await step('non-admin completes org setup-checklist item', 'POST', '/setup-checklist/connect_data_source/complete', { token: ctx.inviteeToken, body: {}, expect: [403, 404] });
    }
    await step('activity feed', 'GET', '/activity', { token: T });
    await step('mentions', 'GET', '/me/mentions', { token: T });
    await step('delete task', 'DELETE', `/tasks/${ctx.taskId}`, { token: T });
  },

  async integrations() {
    domain('integrations');
    const T = A.token;
    const listener = await startListener();
    try {
      // REST connector → internal URL (full-read SSRF probe) → org A KPI
      const con = await step('create REST connector → internal 127.0.0.1 URL', 'POST', '/connectors', {
        token: T,
        body: { name: `Internal REST ${RUN}`, type: 'REST', config: { url: `${listener.url}/metrics`, valuePath: 'data.value', kpiId: ctx.kpiId } },
      });
      if (idOf(con)) {
        await step('run connector', 'POST', `/connectors/${idOf(con)}/run`, { token: T, body: {} });
        const hit = listener.hits.find((h) => h.url === '/metrics');
        check('connector fetched internal 127.0.0.1 URL (SSRF)', !hit, hit ? 'reached internal host' : 'not reached', ['not reached']);
        await step('connector runs', 'GET', `/connectors/${idOf(con)}/runs`, { token: T });
        await step('update connector', 'PATCH', `/connectors/${idOf(con)}`, { token: T, body: { isActive: false } });
        await step('delete connector', 'DELETE', `/connectors/${idOf(con)}`, { token: T });
      }
      // Cross-tenant write via connector config.kpiId
      const evil = await step('org B connector targeting org A KPI', 'POST', '/connectors', {
        token: B.token,
        body: { name: `Evil ${RUN}`, type: 'REST', config: { url: `${listener.url}/metrics`, valuePath: 'data.value', kpiId: ctx.kpiId } },
        expect: [201, 400, 403, 404],
      });
      if (idOf(evil)) {
        await http('POST', `/connectors/${idOf(evil)}/run`, { token: B.token, body: {} });
        const pts = itemsOf((await http('GET', `/kpis/${ctx.kpiId}/data?limit=200`, { token: T })).json);
        const injected = pts.some((p) => p.value === 4242 && String(p.sourceRef ?? '').includes(idOf(evil)));
        check("org B's connector cannot write into org A's KPI", !injected, injected ? 'cross-tenant write' : 'blocked', ['blocked']);
      }

      // Outbound webhooks
      const hook = await step('create webhook → internal URL', 'POST', '/webhooks', { token: T, body: { name: `Hook ${RUN}`, url: `${listener.url}/wh`, events: ['alert.created'] } });
      await step('webhook event catalog', 'GET', '/webhooks/events', { token: T });
      await invalid('create webhook (unknown event)', 'POST', '/webhooks', T, { name: 'Bad', url: 'https://example.com', events: ['nope.nope'] });
      if (idOf(hook)) {
        await step('test webhook', 'POST', `/webhooks/${idOf(hook)}/test`, { token: T, body: {} });
        const hit = await waitFor(() => listener.hits.find((h) => h.url === '/wh'), { timeoutMs: 15_000 });
        check('test webhook delivered (signed) to listener', hit && Object.keys(hit.headers).some((k) => /signature/i.test(k)), hit ? `delivered; headers: ${Object.keys(hit.headers).join(',')}` : 'not delivered', ['delivered+signed']);
        await step('rotate secret', 'POST', `/webhooks/${idOf(hook)}/rotate-secret`, { token: T, body: {} });
        await step('disable webhook', 'PATCH', `/webhooks/${idOf(hook)}`, { token: T, body: { isActive: false } });
        await foreign('delete webhook', 'DELETE', `/webhooks/${idOf(hook)}`);
        await step('delete webhook', 'DELETE', `/webhooks/${idOf(hook)}`, { token: T });
      }

      // API keys
      const key = await step('create API key', 'POST', '/api-keys', { token: T, body: { name: `CI key ${RUN}`, scopes: ['KPI_DATA_ENTRY', 'KPI_VIEW'] } });
      const plain = key?.key ?? key?.plaintext ?? key?.token ?? key?.apiKey;
      check('API key plaintext returned once on create', plain, plain ? 'returned' : `missing (keys: ${Object.keys(key ?? {}).join(',')})`, ['returned']);
      if (plain) {
        await step('ingest with API key', 'POST', '/ingest', { headers: { 'x-api-key': plain, authorization: `Bearer ${plain}` }, body: { kpiId: ctx.kpiId, value: 1234, periodStart: new Date(Date.now() - 7200e3).toISOString(), periodEnd: new Date(Date.now() - 3600e3).toISOString() }, expect: [200, 201, 202, 400] });
        await step('ingest with bogus API key → 401', 'POST', '/ingest', { headers: { 'x-api-key': 'kpinx_bogus', authorization: 'Bearer kpinx_bogus' }, body: { kpiId: ctx.kpiId, value: 1 }, expect: [401, 403] });
      }
      await invalid('create API key (unknown scope)', 'POST', '/api-keys', T, { name: 'Bad key', scopes: ['ROOT'] });
      if (idOf(key)) await step('revoke API key', 'DELETE', `/api-keys/${idOf(key)}`, { token: T });

      // Plugins / custom domains / integrations / SCIM / SSO
      const plug = await step('install plugin', 'POST', '/plugins', { token: T, body: { name: `Audit Widget ${RUN}`, type: 'WIDGET', version: '1.0.0', entryUrl: 'https://example.com/widget.js' } });
      if (idOf(plug)) {
        await step('disable plugin', 'PATCH', `/plugins/${idOf(plug)}`, { token: T, body: { isEnabled: false } });
        await step('uninstall plugin', 'DELETE', `/plugins/${idOf(plug)}`, { token: T });
      }
      await step('plugin with javascript: URL → 400', 'POST', '/plugins', { token: T, body: { name: 'XSS', type: 'WIDGET', version: '1', entryUrl: 'javascript:alert(1)' }, expect: [400] });
      const dom = await step('register custom domain', 'POST', '/custom-domains', { token: T, body: { domain: `metrics-${RUN}.audit.test` } });
      if (idOf(dom)) {
        await step('verify domain (no TXT → not verified)', 'POST', `/custom-domains/${idOf(dom)}/verify`, { token: T, body: {}, expect: [200, 201, 400, 409, 422] });
        await step('delete domain', 'DELETE', `/custom-domains/${idOf(dom)}`, { token: T });
      }
      await step('register domain already used by helios → 409', 'POST', '/custom-domains', { token: T, body: { domain: 'metrics.helios.io' }, expect: [400, 409] });
      const integ = await step('create integration', 'POST', '/integrations', { token: T, body: { provider: 'slack', displayName: 'Audit Slack', tokens: { access_token: 'xoxb-audit' } } });
      if (idOf(integ)) {
        const got = await step('get integration', 'GET', `/integrations/${idOf(integ)}`, { token: T });
        check('integration tokens are not echoed back in plaintext', !JSON.stringify(got ?? {}).includes('xoxb-audit'), JSON.stringify(got ?? {}).includes('xoxb-audit') ? 'plaintext token in response' : 'redacted', ['redacted']);
        await step('delete integration', 'DELETE', `/integrations/${idOf(integ)}`, { token: T });
      }
      await step('public jira webhook without signature → 401/403', 'POST', '/integrations/jira/webhook', { body: { issue: {} }, expect: [400, 401, 403] });
      await step('public slack interactive without signature → 401/403', 'POST', '/integrations/slack/interactive', { body: { payload: '{}' }, expect: [400, 401, 403] });
      await step('public inbound email without signature → 401/403', 'POST', '/webhooks/inbound/email', { body: { from: 'x@y.z', subject: 'hi' }, expect: [400, 401, 403] });
      const scim = await step('mint SCIM token', 'POST', '/scim/tokens', { token: T, body: { label: 'audit' } });
      const scimToken = scim?.token ?? scim?.plaintext;
      if (scimToken) {
        await step('SCIM list users', 'GET', '/scim/v2/Users', { headers: { authorization: `Bearer ${scimToken}` } });
        await step('SCIM create user', 'POST', '/scim/v2/Users', { headers: { authorization: `Bearer ${scimToken}` }, body: { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: `scim-${RUN}@audit.test`, name: { givenName: 'Scim', familyName: 'User' }, emails: [{ value: `scim-${RUN}@audit.test`, primary: true }], active: true } });
        await step("SCIM token can't read org B users", 'GET', `/scim/v2/Users/${B.userId}`, { headers: { authorization: `Bearer ${scimToken}` }, expect: [404] });
        if (idOf(scim)) await step('revoke SCIM token', 'DELETE', `/scim/tokens/${idOf(scim)}`, { token: T });
      }
      await step('SSO config upsert', 'PUT', '/sso/config', { token: T, body: { protocol: 'OIDC', idpMetadataUrl: 'https://idp.audit.test/.well-known/openid-configuration', isActive: false } });
    } finally {
      listener.close();
    }
  },

  async governance() {
    domain('governance');
    const T = A.token;
    await step('audit log', 'GET', '/audit', { token: T });
    const audit = itemsOf((await http('GET', '/audit', { token: T })).json);
    check('audit log recorded this run’s changes', audit.length > 5, audit.length, ['>5']);
    await step('billing', 'GET', '/billing', { token: T });
    await step('set plan (unknown) → 4xx', 'POST', '/billing/plan', { token: T, body: { planKey: 'galactic' }, expect: [400, 404] });
    await step('retention policies', 'GET', '/retention-policies', { token: T });
    await step('apply retention tier', 'POST', '/retention-policies/apply-tier', { token: T, body: { tier: 'PRO' } });
    await step('demo-data seed into audit org', 'POST', '/demo-data/seed', { token: T, body: {}, expect: [200, 201, 202, 403, 409] });
    await step('health', 'GET', '/health');
    // Offboard + purge the invitee last (exercises cleanup paths)
    if (ctx.userId) {
      await step('offboard user', 'POST', `/users/${ctx.userId}/offboard`, { token: T, body: { leaveReason: 'LEFT_ORG', archive: true } });
      await foreign('purge user', 'POST', `/users/${ctx.userId}/purge`, {});
      await step('purge user', 'POST', `/users/${ctx.userId}/purge`, { token: T, body: {} });
    }
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const wanted = process.argv.slice(2);
A = await registerOrg('a');
B = await registerOrg('b');
for (const [name, fn] of Object.entries(scenarios)) {
  if (wanted.length && !wanted.includes(name)) continue;
  try {
    await fn();
  } catch (err) {
    results.push({ domain: name, name: 'scenario crashed (harness)', ok: false, status: 'exception', excerpt: String(err?.stack ?? err).slice(0, 400) });
  }
}

const out = { generatedAt: new Date().toISOString(), run: RUN, orgA: A.slug, orgB: B.slug, results };
const outFile = join(REPO_ROOT, 'docs', 'audit', `api-crud${wanted.length ? `-${wanted.join('-')}` : ''}.json`);
await writeFile(outFile, `${JSON.stringify(out, null, 2)}\n`);

const byDomain = Object.groupBy(results, (r) => r.domain);
for (const [d, list] of Object.entries(byDomain)) {
  const bad = list.filter((r) => !r.ok);
  console.log(`\n## ${d}: ${list.length - bad.length}/${list.length} as expected`);
  for (const r of bad) console.log(`  ✗ ${String(r.status).padEnd(4)} ${r.method ?? ''} ${r.path ?? ''} — ${r.name}\n      expected ${JSON.stringify(r.expect)}  ${(r.excerpt ?? '').replace(/\s+/g, ' ').slice(0, 260)}`);
}
