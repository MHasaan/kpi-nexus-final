import { type ZodType, toJSONSchema } from 'zod';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** One registered route, as discovered from Nest's controller metadata. */
export interface RouteInfo {
  method: HttpMethod;
  /** Express-style path, e.g. /kpis/:id/data */
  path: string;
  controller: string;
  handler: string;
  permissions?: { all?: string[]; any?: string[] };
  isPublic: boolean;
  /** Request body schema from @ApiBody (controllers parse bodies by hand). */
  body?: ZodType;
}

interface Operation {
  operationId: string;
  tags: string[];
  summary: string;
  parameters?: Array<{ name: string; in: 'path'; required: true; schema: { type: 'string' } }>;
  requestBody?: { required: true; content: { 'application/json': { schema: Record<string, unknown> } } };
  responses: Record<string, { description: string }>;
  security: Array<Record<string, string[]>>;
  'x-required-permissions'?: { all?: string[]; any?: string[] };
}

export interface OpenApiDocument {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string }>;
  paths: Record<string, Partial<Record<HttpMethod, Operation>>>;
  components: { securitySchemes: { bearer: { type: 'http'; scheme: 'bearer'; bearerFormat: 'JWT' } } };
}

const SUCCESS: Record<HttpMethod, string> = { get: '200', post: '200', put: '200', patch: '200', delete: '200' };

const tagOf = (controller: string) => controller.replace(/Controller$/, '');

function bodySchema(schema: ZodType): Record<string, unknown> {
  const json = toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Builds the API's OpenAPI 3.1 document from its registered routes. Paths and
 * methods are sorted so the committed openapi.json only changes when routes do.
 */
export function buildOpenApiDocument(routes: RouteInfo[], opts: { version: string }): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  const tags = new Set<string>();
  const sorted = [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

  for (const r of sorted) {
    const path = r.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const params = [...r.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
    const tag = tagOf(r.controller);
    tags.add(tag);
    const responses: Operation['responses'] = { [SUCCESS[r.method]]: { description: 'Success' } };
    if (!r.isPublic) {
      responses['401'] = { description: 'Not signed in' };
      responses['403'] = { description: 'Missing a required permission' };
    }
    const op: Operation = {
      operationId: `${r.controller}_${r.handler}`,
      tags: [tag],
      summary: `${r.method.toUpperCase()} ${r.path}`,
      ...(params.length ? { parameters: params.map((name) => ({ name, in: 'path' as const, required: true as const, schema: { type: 'string' as const } })) } : {}),
      ...(r.body ? { requestBody: { required: true as const, content: { 'application/json': { schema: bodySchema(r.body) } } } } : {}),
      responses,
      security: r.isPublic ? [] : [{ bearer: [] }],
      ...(!r.isPublic && r.permissions && (r.permissions.all?.length || r.permissions.any?.length) ? { 'x-required-permissions': r.permissions } : {}),
    };
    paths[path] = { ...(paths[path] ?? {}), [r.method]: op };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'KPI Nexus API',
      version: opts.version,
      description: 'Multi-tenant KPI tracking API. Authenticate with a bearer access token (POST /auth/login). Each operation lists the permissions it needs in x-required-permissions; list endpoints return only what the caller may see.',
    },
    servers: [{ url: '/', description: 'This API (relative to where the document is served)' }],
    tags: [...tags].sort().map((name) => ({ name })),
    paths,
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  };
}
