/**
 * KPI Nexus TypeScript SDK: a typed client over the API's OpenAPI document.
 * `schema.d.ts` is generated from apps/api/openapi.json (`pnpm sdk:regenerate`);
 * request paths, parameters and bodies are checked against it at compile time.
 */
import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './schema.js';

export type { components, operations, paths } from './schema.js';

export interface KpiNexusClientOptions {
  /** API origin, e.g. https://api.example.com */
  baseUrl: string;
  /** Bearer access token (POST /auth/login). Omit for public endpoints. */
  token?: string;
  /** Custom fetch (tests, other runtimes). */
  fetch?: typeof fetch;
}

export type KpiNexusClient = Client<paths>;

export function createKpiNexusClient(opts: KpiNexusClientOptions): KpiNexusClient {
  return createClient<paths>({
    baseUrl: opts.baseUrl,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.token ? { headers: { authorization: `Bearer ${opts.token}` } } : {}),
  });
}
