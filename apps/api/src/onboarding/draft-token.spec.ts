import { describe, expect, it } from 'vitest';

import { deriveDraftToken, hashDraftToken, mergeDraft, verifyDraftToken } from './draft-token.js';

describe('draft token', () => {
  it('derives a deterministic 64-hex token from session id + secret', () => {
    const a = deriveDraftToken('sess_1', 'secret');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(deriveDraftToken('sess_1', 'secret')).toBe(a); // deterministic
    expect(deriveDraftToken('sess_2', 'secret')).not.toBe(a);
    expect(deriveDraftToken('sess_1', 'other')).not.toBe(a);
  });

  it('verifies a token against its stored hash (timing-safe)', () => {
    const token = deriveDraftToken('sess_1', 'secret');
    const stored = hashDraftToken(token);
    expect(verifyDraftToken(token, stored)).toBe(true);
    expect(verifyDraftToken('wrong-token', stored)).toBe(false);
  });

  it('rejects when the stored hash is null or token empty', () => {
    expect(verifyDraftToken('x', null)).toBe(false);
    expect(verifyDraftToken('', hashDraftToken('x'))).toBe(false);
  });

  it('stored hash is not the token itself (defence on DB leak)', () => {
    const token = deriveDraftToken('sess_1', 'secret');
    expect(hashDraftToken(token)).not.toBe(token);
  });
});

describe('mergeDraft', () => {
  it('shallow-merges patch over current (patch wins per top-level key)', () => {
    const merged = mergeDraft({ organization: { name: 'Old' }, roles: [1] }, { organization: { name: 'New' } });
    expect(merged).toEqual({ organization: { name: 'New' }, roles: [1] });
  });

  it('adds new keys + preserves untouched ones', () => {
    expect(mergeDraft({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it('treats a non-object current as empty', () => {
    expect(mergeDraft(null, { a: 1 })).toEqual({ a: 1 });
  });
});
