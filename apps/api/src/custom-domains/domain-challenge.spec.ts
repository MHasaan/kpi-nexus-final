import { describe, expect, it } from 'vitest';

import { buildChallenge, normalizeDomain } from './domain-challenge.js';

describe('normalizeDomain', () => {
  it('lowercases and strips protocol/trailing slash/whitespace', () => {
    expect(normalizeDomain('  HTTPS://Dash.Acme.COM/ ')).toBe('dash.acme.com');
    expect(normalizeDomain('dash.acme.com')).toBe('dash.acme.com');
  });
});

describe('buildChallenge', () => {
  it('produces a fixed TXT key and a deterministic value for an org+domain', () => {
    const a = buildChallenge('dash.acme.com', 'org1');
    expect(a.key).toBe('_kpinexus-challenge.dash.acme.com');
    expect(a.value).toMatch(/^kpinexus-verify=[0-9a-f]{32}$/);
    // Deterministic.
    expect(buildChallenge('dash.acme.com', 'org1')).toEqual(a);
  });

  it('differs by org and by domain', () => {
    expect(buildChallenge('dash.acme.com', 'org1').value).not.toBe(buildChallenge('dash.acme.com', 'org2').value);
    expect(buildChallenge('a.com', 'org1').value).not.toBe(buildChallenge('b.com', 'org1').value);
  });
});
