/**
 * TRUST_PROXY parsing (audit OT-009). Trusting X-Forwarded-For must be an
 * explicit deployment decision — otherwise any client can spoof req.ip and
 * dodge per-IP rate limits.
 */
import { describe, expect, test } from 'vitest';

import { fastifyTrustProxy, parseTrustProxy } from './trust-proxy.js';

describe('fastifyTrustProxy', () => {
  test('a hop count becomes a trust function that trusts exactly that many hops', () => {
    const fn = fastifyTrustProxy('1');
    expect(typeof fn).toBe('function');
    const trust = fn as (address: string, hop: number) => boolean;
    expect(trust('10.0.0.1', 0)).toBe(true);
    expect(trust('10.0.0.1', 1)).toBe(false);
  });

  test('unset stays false', () => {
    expect(fastifyTrustProxy(undefined)).toBe(false);
  });
});

describe('parseTrustProxy', () => {
  test.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['true', true],
    ['1', 1],
    ['2', 2],
    ['10.0.0.0/8', ['10.0.0.0/8']],
    ['10.0.0.1, 172.16.0.0/12', ['10.0.0.1', '172.16.0.0/12']],
  ])('TRUST_PROXY=%j → %j', (raw, expected) => {
    expect(parseTrustProxy(raw)).toEqual(expected);
  });
});
