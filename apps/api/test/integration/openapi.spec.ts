/**
 * OpenAPI document, live: served publicly at /api/v1/openapi.json, lists every
 * route with unique operation ids and auth, carries request schemas for the
 * core write routes, and equals the committed apps/api/openapi.json (so the
 * SDK generated from it matches the running API).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

type Op = { operationId: string; security: unknown[]; requestBody?: { content: { 'application/json': { schema: { properties?: Record<string, unknown> } } } } };
type Doc = { openapi: string; paths: Record<string, Record<string, Op>> };

describe('OpenAPI document', () => {
  test('is served publicly, complete and consistent', async () => {
    const res = await fetch(`${API_URL}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Doc;
    expect(doc.openapi).toBe('3.1.0');

    const ops = Object.entries(doc.paths).flatMap(([path, methods]) => Object.entries(methods).map(([m, op]) => ({ path, m, op })));
    expect(ops.length).toBeGreaterThan(300);
    const ids = ops.map((o) => o.op.operationId);
    expect(new Set(ids).size).toBe(ids.length);

    const body = (path: string, m: string) => doc.paths[path]?.[m]?.requestBody?.content['application/json'].schema;
    expect(Object.keys(body('/auth/login', 'post')?.properties ?? {})).toEqual(expect.arrayContaining(['email', 'password']));
    expect(Object.keys(body('/kpis', 'post')?.properties ?? {})).toEqual(expect.arrayContaining(['name', 'scope']));
    expect(Object.keys(body('/kpis/{id}/data', 'post')?.properties ?? {})).toEqual(expect.arrayContaining(['value', 'periodStart', 'periodEnd']));
    expect(Object.keys(body('/kpis/{id}/data/{pointId}', 'patch')?.properties ?? {})).toEqual(expect.arrayContaining(['reason']));

    expect(doc.paths['/health']?.get?.security).toEqual([]);
    expect(doc.paths['/kpis']?.get?.security).toEqual([{ bearer: [] }]);
  });

  test('equals the committed apps/api/openapi.json', async () => {
    const live = await (await fetch(`${API_URL}/api/v1/openapi.json`)).json();
    const committed = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi.json'), 'utf8'));
    expect(live).toEqual(committed);
  });
});
