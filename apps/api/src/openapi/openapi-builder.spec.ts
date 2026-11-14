/**
 * OpenAPI document from the routes the API registers. The controllers parse
 * request bodies with Zod by hand, so request schemas come from an explicit
 * @ApiBody(schema) (converted by Zod's own JSON Schema export); every route is
 * listed either way, with its path parameters, auth and required permissions.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildOpenApiDocument, type RouteInfo } from './openapi-builder.js';

const routes: RouteInfo[] = [
  { method: 'get', path: '/kpis', controller: 'KpisController', handler: 'list', permissions: { all: ['KPI_VIEW'] }, isPublic: false },
  {
    method: 'post',
    path: '/kpis/:id/data',
    controller: 'KpiDataController',
    handler: 'recordOrgWide',
    permissions: { all: ['KPI_DATA_ENTRY'] },
    isPublic: false,
    body: z.object({ value: z.number(), note: z.string().max(500).optional() }).strict(),
  },
  { method: 'patch', path: '/kpis/:id/data/:pointId', controller: 'KpiDataController', handler: 'correct', permissions: { any: ['KPI_DATA_ENTRY', 'KPI_EDIT'] }, isPublic: false },
  { method: 'get', path: '/health', controller: 'HealthController', handler: 'health', isPublic: true },
];

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument(routes, { version: '1.2.3' });

  it('is an OpenAPI 3.1 document with bearer auth', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info).toMatchObject({ title: 'KPI Nexus API', version: '1.2.3' });
    expect(doc.components.securitySchemes.bearer).toEqual({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
    expect(doc.servers).toEqual([{ url: '/', description: 'This API (relative to where the document is served)' }]);
  });

  it('turns :params into {params} with required path parameters', () => {
    const op = doc.paths['/kpis/{id}/data/{pointId}']!.patch!;
    expect(op.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'pointId', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('gives every operation a unique operationId and a tag from its controller', () => {
    const ops = Object.values(doc.paths).flatMap((p) => Object.values(p));
    const ids = ops.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc.paths['/kpis']!.get).toMatchObject({ operationId: 'KpisController_list', tags: ['Kpis'] });
  });

  it('records auth and the permissions each route needs', () => {
    expect(doc.paths['/kpis']!.get!.security).toEqual([{ bearer: [] }]);
    expect(doc.paths['/kpis']!.get!['x-required-permissions']).toEqual({ all: ['KPI_VIEW'] });
    expect(doc.paths['/kpis/{id}/data/{pointId}']!.patch!['x-required-permissions']).toEqual({ any: ['KPI_DATA_ENTRY', 'KPI_EDIT'] });
    expect(doc.paths['/health']!.get!.security).toEqual([]);
    expect(doc.paths['/health']!.get!['x-required-permissions']).toBeUndefined();
  });

  it('includes a request body from the route\'s Zod schema', () => {
    const body = doc.paths['/kpis/{id}/data']!.post!.requestBody!;
    expect(body.required).toBe(true);
    expect(body.content['application/json'].schema).toMatchObject({
      type: 'object',
      properties: { value: { type: 'number' }, note: { type: 'string', maxLength: 500 } },
      required: ['value'],
      additionalProperties: false,
    });
    expect(body.content['application/json'].schema).not.toHaveProperty('$schema');
  });

  it('every operation documents its responses', () => {
    const op = doc.paths['/kpis']!.get!;
    expect(Object.keys(op.responses).sort()).toEqual(['200', '401', '403']);
    expect(Object.keys(doc.paths['/health']!.get!.responses)).toEqual(['200']);
  });

  it('is stable: paths and methods in sorted order', () => {
    expect(Object.keys(doc.paths)).toEqual([...Object.keys(doc.paths)].sort());
  });
});
