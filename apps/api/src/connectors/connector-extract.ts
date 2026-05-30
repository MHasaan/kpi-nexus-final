/**
 * Pure config parsing + row extraction for REST/GraphQL connectors. No I/O so it
 * is unit-testable; the runners do the fetch and hand the JSON here.
 */

export interface ExtractConfig {
  kpiId: string;
  valuePath: string;
  arrayPath?: string;
  recordedAtPath?: string;
}

export interface RestConfig extends ExtractConfig {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export interface GraphqlConfig extends ExtractConfig {
  url: string;
  query: string;
  variables?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface ExtractedRow {
  kpiId: string;
  value: number;
  recordedAt: Date | undefined;
}

/** Navigate a dotted path (`a.b.c`) through nested objects/arrays. */
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function toDate(v: unknown): Date | undefined {
  if (v === null || v === undefined) return undefined;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function rowsFromRoot(root: unknown, config: ExtractConfig): ExtractedRow[] {
  if (config.arrayPath) {
    const arr = getByPath(root, config.arrayPath);
    if (!Array.isArray(arr)) return [];
    const out: ExtractedRow[] = [];
    for (const item of arr) {
      const value = toNumber(getByPath(item, config.valuePath));
      if (value === null) continue; // skip non-numeric rows
      out.push({ kpiId: config.kpiId, value, recordedAt: config.recordedAtPath ? toDate(getByPath(item, config.recordedAtPath)) : undefined });
    }
    return out;
  }
  const value = toNumber(getByPath(root, config.valuePath));
  if (value === null) return [];
  return [{ kpiId: config.kpiId, value, recordedAt: config.recordedAtPath ? toDate(getByPath(root, config.recordedAtPath)) : undefined }];
}

export function extractRestRows(payload: unknown, config: ExtractConfig): ExtractedRow[] {
  return rowsFromRoot(payload, config);
}

export function extractGraphqlRows(response: unknown, config: ExtractConfig): ExtractedRow[] {
  const resp = response as { data?: unknown; errors?: Array<{ message?: string }> };
  if (resp.errors && resp.errors.length > 0) {
    throw new Error(`GraphQL error: ${resp.errors.map((e) => e.message ?? 'unknown').join('; ')}`);
  }
  return rowsFromRoot(resp.data, config);
}

/** Validate + narrow a connector's JSON config by type. Throws on missing fields. */
export function parseConnectorConfig(type: 'REST', config: unknown): RestConfig;
export function parseConnectorConfig(type: 'GRAPHQL', config: unknown): GraphqlConfig;
export function parseConnectorConfig(type: 'REST' | 'GRAPHQL', config: unknown): RestConfig | GraphqlConfig {
  const c = (config ?? {}) as Record<string, unknown>;
  if (typeof c.url !== 'string' || !c.url) throw new Error('connector config requires a url');
  if (typeof c.valuePath !== 'string' || !c.valuePath) throw new Error('connector config requires a valuePath');
  if (typeof c.kpiId !== 'string' || !c.kpiId) throw new Error('connector config requires a kpiId');
  if (type === 'GRAPHQL' && (typeof c.query !== 'string' || !c.query)) {
    throw new Error('GraphQL connector config requires a query');
  }
  return c as unknown as RestConfig | GraphqlConfig;
}
