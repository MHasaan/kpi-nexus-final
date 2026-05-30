/**
 * Pure row-extraction for REST/GraphQL connectors. 9 cases: dot-path lookup,
 * single + array REST extraction, recordedAt parsing, bad-value skip, GraphQL
 * data-envelope extraction, GraphQL errors[] rejection, config validation.
 */
import { describe, expect, test } from 'vitest';

import {
  extractGraphqlRows,
  extractRestRows,
  getByPath,
  parseConnectorConfig,
} from './connector-extract.js';

describe('getByPath', () => {
  test('navigates a dotted path', () => {
    expect(getByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });
  test('returns undefined for a missing path', () => {
    expect(getByPath({ a: {} }, 'a.b.c')).toBeUndefined();
  });
});

describe('extractRestRows', () => {
  test('single value (no arrayPath)', () => {
    const rows = extractRestRows({ stargazers_count: 123 }, { kpiId: 'k', valuePath: 'stargazers_count' });
    expect(rows).toEqual([{ kpiId: 'k', value: 123, recordedAt: undefined }]);
  });

  test('array with valuePath + recordedAtPath (relative to each item)', () => {
    const payload = { items: [{ v: 10, t: '2026-01-01T00:00:00Z' }, { v: 20, t: '2026-02-01T00:00:00Z' }] };
    const rows = extractRestRows(payload, { kpiId: 'k', arrayPath: 'items', valuePath: 'v', recordedAtPath: 't' });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.value).toBe(10);
    expect(rows[0]!.recordedAt).toBeInstanceOf(Date);
    expect(rows[1]!.value).toBe(20);
  });

  test('skips array items whose value is not numeric', () => {
    const payload = { items: [{ v: 5 }, { v: 'nope' }, { v: 7 }] };
    const rows = extractRestRows(payload, { kpiId: 'k', arrayPath: 'items', valuePath: 'v' });
    expect(rows.map((r) => r.value)).toEqual([5, 7]);
  });

  test('coerces numeric strings', () => {
    const rows = extractRestRows({ n: '3.14' }, { kpiId: 'k', valuePath: 'n' });
    expect(rows[0]!.value).toBeCloseTo(3.14);
  });
});

describe('extractGraphqlRows', () => {
  test('extracts an array from the data envelope', () => {
    const resp = { data: { repo: { history: [{ count: 1 }, { count: 2 }] } } };
    const rows = extractGraphqlRows(resp, { kpiId: 'k', arrayPath: 'repo.history', valuePath: 'count' });
    expect(rows.map((r) => r.value)).toEqual([1, 2]);
  });

  test('extracts a single value from the data envelope', () => {
    const resp = { data: { repo: { stars: 99 } } };
    const rows = extractGraphqlRows(resp, { kpiId: 'k', valuePath: 'repo.stars' });
    expect(rows).toEqual([{ kpiId: 'k', value: 99, recordedAt: undefined }]);
  });

  test('throws when the GraphQL response carries errors[]', () => {
    const resp = { errors: [{ message: 'boom' }], data: null };
    expect(() => extractGraphqlRows(resp, { kpiId: 'k', valuePath: 'x' })).toThrow(/boom/);
  });
});

describe('parseConnectorConfig', () => {
  test('rejects a REST config without a valuePath', () => {
    expect(() => parseConnectorConfig('REST', { url: 'http://x' })).toThrow();
  });
  test('rejects a GraphQL config without a query', () => {
    expect(() => parseConnectorConfig('GRAPHQL', { url: 'http://x', valuePath: 'a' })).toThrow();
  });
  test('accepts a valid REST config', () => {
    const cfg = parseConnectorConfig('REST', { url: 'http://x', valuePath: 'a', kpiId: 'k' });
    expect(cfg.url).toBe('http://x');
  });
});
