import { describe, expect, it } from 'vitest';

import { purgedHandle } from './purge-handle.js';

describe('purgedHandle', () => {
  it('is deterministic for the same org+user', () => {
    expect(purgedHandle('org1', 'userA')).toBe(purgedHandle('org1', 'userA'));
  });

  it('differs across users and orgs', () => {
    expect(purgedHandle('org1', 'userA')).not.toBe(purgedHandle('org1', 'userB'));
    expect(purgedHandle('org1', 'userA')).not.toBe(purgedHandle('org2', 'userA'));
  });

  it('has the former-user- prefix and a 12-char hash', () => {
    const h = purgedHandle('org1', 'userA');
    expect(h).toMatch(/^former-user-[0-9a-f]{12}$/);
  });

  it('contains no PII (does not embed the raw ids)', () => {
    const h = purgedHandle('acme-corp', 'alice@example.com');
    expect(h).not.toContain('acme-corp');
    expect(h).not.toContain('alice');
  });
});
