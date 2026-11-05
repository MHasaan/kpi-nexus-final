import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('../../', import.meta.url);

async function outputDir(t) {
  const path = await mkdtemp(join(tmpdir(), 'nexus-audit-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

// Keep the CLI entry points and filesystem real while supplying HTTP responses
// without a live service or a listening socket.
async function fetchFixture(dir, status, body) {
  const preload = join(dir, 'fetch-fixture.mjs');
  await writeFile(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(body)}, {
    status: ${status}, headers: { 'content-type': 'application/json' },
  });`);
  return preload;
}

const script = (name, path, preload) =>
  run(process.execPath, [...(preload ? ['--import', preload] : []), `scripts/audit/${name}.mjs`], {
    cwd: root,
    env: { ...process.env, AUDIT_OUTPUT_DIR: path },
  });

test('route inventory creates its report under AUDIT_OUTPUT_DIR', async (t) => {
  const path = join(await outputDir(t), 'new', 'directory');
  await script('api-routes', path);
  const routes = JSON.parse(await readFile(join(path, 'api-routes.json'), 'utf8'));
  assert.ok(routes.some(({ method, path }) => method === 'GET' && path === '/auth/me'));
});

test('CRUD setup fails with a sanitized report even when login echoes credentials', async (t) => {
  const path = await outputDir(t);
  const privateValue = 'fixture-secret-"quoted"-' + 'a'.repeat(500);
  const preload = await fetchFixture(path, 503, JSON.stringify({ data: { password: privateValue }, url: '/share/fixture-share-token' }, null, 2));
  await assert.rejects(script('api-crud', path, preload), (err) => {
    assert.equal(err.code, 1);
    assert.doesNotMatch(err.stdout + err.stderr, /fixture-secret|fixture-share-token/);
    return true;
  });
  const report = await readFile(join(path, 'api-crud.json'), 'utf8');
  assert.doesNotMatch(report, /fixture-secret|fixture-share-token/);
  assert.ok(JSON.parse(report).results.some((r) => !r.ok && r.domain === 'setup'));
});

test('ML authentication failure is visible in the exit code and redacted output', async (t) => {
  const path = await outputDir(t);
  const preload = await fetchFixture(path, 401, JSON.stringify({ detail: 'Bad signature', config: { signingSecret: 'fixture-signing-secret' } }, null, 2));
  await assert.rejects(script('ml-probe', path, preload), (err) => {
    assert.equal(err.code, 1);
    assert.doesNotMatch(err.stdout + err.stderr, /fixture-signing-secret/);
    return true;
  });
  const report = await readFile(join(path, 'ml-probe.json'), 'utf8');
  assert.doesNotMatch(report, /fixture-signing-secret/);
  assert.equal(JSON.parse(report).results.find((r) => r.name === 'forecast naive').ok, false);
});

test('redacts nested values and escaped strings before taking an excerpt', async () => {
  const { auditExcerpt } = await import('./common.mjs');
  const data = {
    profile: { accessToken: 'sensitive-"quote"\\slash', details: [{ 'client_secret': { raw: 'sensitive-object' } }] },
    keep: true,
  };
  for (const text of [JSON.stringify(data), JSON.stringify(data, null, 2)]) {
    const output = auditExcerpt(text, 1000);
    assert.doesNotMatch(output, /sensitive/);
    assert.match(output, /"keep":\s*true/);
  }
  assert.equal(auditExcerpt('Oops {"password" : "sensitive\\"quote' + 'z'.repeat(500) + '"}', 120), 'Oops {"password" : "<redacted>"}');
});

test('redacts token-bearing URLs and auth diagnostics without losing route and nonsecret query details', async () => {
  const { redactAuditText } = await import('./common.mjs');
  const input = 'GET https://example.test/share/secret-one?theme=light&access_token=secret-two then /public/embed/kpi/secret-three, /public/dashboards/secret-four and /login?token=secret-five; Authorization: Bearer secret-six';
  const result = redactAuditText(input);
  assert.doesNotMatch(result, /secret-/);
  assert.match(result, /\/share\/[^?]+\?theme=light&access_token=/);
  assert.match(result, /\/public\/embed\/kpi\//);
  assert.match(result, /\/public\/dashboards\//);
  assert.match(result, /\/public\/dashboards\/:token|\/public\/dashboards\//);
});

test('email audit requires escaped markers in the HTML part of the actual message', async () => {
  const { auditEmailHtml } = await import('./common.mjs');
  const html = (Body) => ({ Headers: { 'Content-Type': ['text/html; charset=UTF-8'] }, Body });
  const text = { Headers: { 'Content-Type': ['text/plain'] }, Body: 'Invite <b>Org</b>' };
  const mail = (...Parts) => ({ MIME: { Parts } });
  assert.equal(auditEmailHtml(mail(text, html('<p>Invite &lt;b&gt;Org&lt;/b&gt;</p>')), ['<b>Org</b>']), 'escaped');
  assert.equal(auditEmailHtml(mail(text, html('<p>Invite <b>Org</b></p>')), ['<b>Org</b>']), 'raw HTML present');
  assert.equal(auditEmailHtml(mail(text, html('<p>Invite to your organization</p>')), ['<b>Org</b>']), 'escaped marker missing');
  assert.equal(auditEmailHtml(mail(text), ['<b>Org</b>']), 'HTML part missing');
});

test('crawl renews access tokens before expiry and rejects an unreadable expiry', async () => {
  const { crawlNeedsRefresh } = await import('./common.mjs');
  const jwt = (exp) => `header.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.signature`;
  assert.equal(crawlNeedsRefresh(jwt(1_800_000_090), 1_800_000_000_000), true);
  assert.equal(crawlNeedsRefresh(jwt(1_800_000_180), 1_800_000_000_000), false);
  assert.throws(() => crawlNeedsRefresh('malformed'), /expiry/);
});
