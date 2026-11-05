#!/usr/bin/env node
/**
 * Direct probe of the ML sidecar (audit tooling).
 *
 * Signs requests the way the API does (HMAC-SHA256 over "{ts}.{tenant}") and
 * sends normal + edge-case payloads to every router, plus auth negatives.
 * Any 5xx, hang, or non-JSON response is a finding.
 *
 *   node --env-file=apps/ml/.env scripts/audit/ml-probe.mjs
 */

import { createHash, createHmac } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditExcerpt, auditOutputDir, failAudit, writeAuditJson } from './common.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ML_URL = process.env.ML_SIDECAR_URL ?? 'http://127.0.0.1:8000';
const SECRET = process.env.ML_SIDECAR_HMAC_SECRET ?? 'dev-ml-shared-secret';
const TENANT = 'audit-tenant';

// Same scheme as apps/api/src/ml/ml-signature.ts (method/path/body-bound, BE-024).
function sign(path, bodyText, { ts = Date.now(), secret = SECRET } = {}) {
  const bodyHash = createHash('sha256').update(bodyText).digest('hex');
  return {
    'X-Tenant-Id': TENANT,
    'X-Signature-Timestamp': String(ts),
    'X-Signature': createHmac('sha256', secret).update(`${ts}.${TENANT}.POST.${path}.${bodyHash}`).digest('hex'),
  };
}

/** `signer(path, bodyText)` returns the auth headers; the default signs correctly. */
async function call(path, body, signer = (p, b) => sign(p, b)) {
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = signer(path, bodyText);
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${ML_URL}${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', ...headers },
      body: bodyText,
    });
    const text = await res.text();
    let json = false;
    try {
      JSON.parse(text);
      json = true;
    } catch {
      // A matching status alone does not establish a working sidecar.
    }
    return { status: res.status, ms: Math.round(performance.now() - started), text: auditExcerpt(text, 300), json };
  } catch (err) {
    return { status: 0, ms: Math.round(performance.now() - started), text: auditExcerpt(err?.name ?? err, 300) };
  } finally {
    clearTimeout(timer);
  }
}

const series = Array.from({ length: 36 }, (_, i) => 100 + i * 2 + 10 * Math.sin((i * Math.PI) / 6) + (i === 20 ? 60 : 0));

const cases = [
  // [name, path, body, expected statuses]
  ['anomaly ensemble', '/anomaly/detect', { values: series }, [200]],
  ['anomaly isolation_forest', '/anomaly/detect', { values: series, method: 'isolation_forest' }, [200]],
  ['anomaly zscore', '/anomaly/detect', { values: series, method: 'zscore' }, [200]],
  ['anomaly ewma', '/anomaly/detect', { values: series, method: 'ewma' }, [200]],
  ['anomaly unknown method', '/anomaly/detect', { values: series, method: 'tarot' }, [400, 422]],
  ['anomaly empty series', '/anomaly/detect', { values: [] }, [200, 400, 422]],
  ['anomaly single point', '/anomaly/detect', { values: [5] }, [200, 400, 422]],
  ['anomaly constant series', '/anomaly/detect', { values: Array(20).fill(7) }, [200]],
  ['anomaly timestamps length mismatch', '/anomaly/detect', { values: series, timestamps: ['2026-01-01'] }, [200, 400, 422]],
  ['forecast naive', '/forecast', { values: series, horizon: 6 }, [200]],
  ['forecast prophet (deferred)', '/forecast', { values: series, horizon: 6, model: 'prophet' }, [200]],
  ['forecast horizon 0', '/forecast', { values: series, horizon: 0 }, [200, 400, 422]],
  ['forecast negative horizon', '/forecast', { values: series, horizon: -5 }, [400, 422]],
  ['forecast huge horizon (1e6)', '/forecast', { values: series, horizon: 1_000_000 }, [400, 422]],
  ['forecast empty series', '/forecast', { values: [], horizon: 3 }, [400, 422]],
  ['forecast single point', '/forecast', { values: [42], horizon: 3 }, [200, 400, 422]],
  ['correlation pearson', '/correlation', { series: { a: series, b: series.map((v) => v * 2 + 1) } }, [200]],
  ['correlation spearman', '/correlation', { series: { a: series, b: series.map((v) => -v) }, method: 'spearman' }, [200]],
  ['correlation unequal lengths', '/correlation', { series: { a: series, b: [1, 2, 3] } }, [400, 422]],
  ['correlation single series', '/correlation', { series: { a: series } }, [200, 400, 422]],
  ['correlation constant series (zero variance)', '/correlation', { series: { a: Array(10).fill(1), b: series.slice(0, 10) } }, [200, 400, 422]],
  ['seasonality monthly', '/seasonality', { series, period: 12 }, [200]],
  ['seasonality auto period', '/seasonality', { series }, [200, 400, 422]],
  ['seasonality too short for period', '/seasonality', { series: series.slice(0, 5), period: 12 }, [400, 422]],
  ['seasonality multiplicative with zeros', '/seasonality', { series: [0, ...series.slice(1)], period: 12, model: 'multiplicative' }, [200, 400, 422]],
  ['whatif percent', '/whatif', { baseline: { values: series }, scenarios: [{ name: 'up10', type: 'percent', value: 10 }] }, [200]],
  ['whatif unknown scenario type', '/whatif', { baseline: { values: series }, scenarios: [{ type: 'magic' }] }, [200, 400, 422]],
  ['whatif empty baseline', '/whatif', { baseline: { values: [] }, scenarios: [{ type: 'percent', value: 5 }] }, [200, 400, 422]],
  ['malformed JSON body', '/forecast', '{"values": [1,2,', [400, 422]],
];

async function main() {
  const results = [];
  for (const [name, path, body, expect] of cases) {
    const r = await call(path, body);
    results.push({ name, path, status: r.status, ms: r.ms, ok: r.json && expect.includes(r.status), expect, excerpt: r.text });
  }

  // Auth negatives
  const auth = [
    ['no signature headers', () => ({}), [401]],
    ['wrong secret', (p, b) => sign(p, b, { secret: 'not-the-secret' }), [401]],
    ['stale timestamp (10 min old)', (p, b) => sign(p, b, { ts: Date.now() - 10 * 60_000 }), [401]],
    ['future timestamp (10 min ahead)', (p, b) => sign(p, b, { ts: Date.now() + 10 * 60_000 }), [401]],
    ['non-numeric timestamp', (p, b) => ({ ...sign(p, b), 'X-Signature-Timestamp': 'abc' }), [401]],
    ['signature replayed with a different body', (p) => sign(p, JSON.stringify({ values: [1], horizon: 1 })), [401]],
    ['signature replayed against another path', (_p, b) => sign('/whatif', b), [401]],
  ];
  for (const [name, signer, expect] of auth) {
    const r = await call('/forecast', { values: series, horizon: 3 }, signer);
    results.push({ name: `auth: ${name}`, path: '/forecast', status: r.status, ms: r.ms, ok: r.json && expect.includes(r.status), expect, excerpt: r.text });
  }

  await writeAuditJson(join(auditOutputDir(REPO_ROOT), 'ml-probe.json'), { generatedAt: new Date().toISOString(), mlUrl: ML_URL, results });
  const bad = results.filter((r) => !r.ok);
  console.log(`${results.length - bad.length}/${results.length} as expected`);
  for (const r of results) {
    console.log(`${r.ok ? '  ✓' : '  ✗'} ${String(r.status).padEnd(3)} ${String(r.ms).padStart(5)}ms  ${r.name}${r.ok ? '' : `  — expected ${JSON.stringify(r.expect)}: ${r.excerpt.replace(/\s+/g, ' ').slice(0, 160)}`}`);
  }
  if (bad.length) process.exitCode = 1;
}

await main().catch(failAudit);
