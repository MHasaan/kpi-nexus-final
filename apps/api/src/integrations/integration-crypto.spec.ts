/**
 * Pure AES-256-GCM crypto for integration tokens at rest. 12 cases: master-key
 * loading (hex / base64 / passphrase / dev-default), roundtrip, tamper detection
 * (ciphertext + tag), short-cipher rejection, wrong-key rejection, large + UTF-8
 * payloads, and IV uniqueness.
 */
import { randomBytes } from 'node:crypto';
import { describe, expect, test } from 'vitest';

import { decryptTokens, encryptTokens, loadMasterKey } from './integration-crypto.js';

describe('loadMasterKey', () => {
  test('loads a 64-char hex key (32 bytes)', () => {
    const hex = randomBytes(32).toString('hex');
    const key = loadMasterKey({ INTEGRATION_CRYPTO_KEY: hex });
    expect(key.length).toBe(32);
  });

  test('loads a base64 key that decodes to 32 bytes', () => {
    const b64 = randomBytes(32).toString('base64');
    const key = loadMasterKey({ INTEGRATION_CRYPTO_KEY: b64 });
    expect(key.length).toBe(32);
  });

  test('derives a 32-byte key from an arbitrary passphrase (SHA-256)', () => {
    const key = loadMasterKey({ INTEGRATION_CRYPTO_KEY: 'a short human passphrase' });
    expect(key.length).toBe(32);
  });

  test('falls back to a dev default when unset (non-production)', () => {
    const key = loadMasterKey({});
    expect(key.length).toBe(32);
  });

  test('refuses the dev default in production', () => {
    expect(() => loadMasterKey({ NODE_ENV: 'production' })).toThrow();
  });
});

describe('encrypt / decrypt roundtrip', () => {
  const key = loadMasterKey({ INTEGRATION_CRYPTO_KEY: randomBytes(32).toString('hex') });

  test('roundtrips a JSON token blob', () => {
    const tokens = { access_token: 'xoxb-abc', refresh_token: 'r-123', expires_at: 1700000000 };
    const blob = encryptTokens(tokens, key);
    expect(typeof blob).toBe('string');
    expect(decryptTokens(blob, key)).toEqual(tokens);
  });

  test('two encryptions of the same value differ (random IV)', () => {
    const a = encryptTokens({ x: 1 }, key);
    const b = encryptTokens({ x: 1 }, key);
    expect(a).not.toBe(b);
  });

  test('tampered ciphertext is rejected', () => {
    const blob = encryptTokens({ secret: 'value' }, key);
    const raw = Buffer.from(blob, 'base64');
    raw.writeUInt8((raw.at(-1) ?? 0) ^ 0xff, raw.length - 1); // flip a ciphertext byte
    expect(() => decryptTokens(raw.toString('base64'), key)).toThrow();
  });

  test('tampered auth tag is rejected', () => {
    const blob = encryptTokens({ secret: 'value' }, key);
    const raw = Buffer.from(blob, 'base64');
    raw.writeUInt8((raw.at(13) ?? 0) ^ 0xff, 13); // flip a byte inside the tag (offset 12..27)
    expect(() => decryptTokens(raw.toString('base64'), key)).toThrow();
  });

  test('a too-short cipher is rejected', () => {
    const tooShort = randomBytes(10).toString('base64');
    expect(() => decryptTokens(tooShort, key)).toThrow();
  });

  test('wrong key cannot decrypt', () => {
    const blob = encryptTokens({ secret: 'value' }, key);
    const other = loadMasterKey({ INTEGRATION_CRYPTO_KEY: randomBytes(32).toString('hex') });
    expect(() => decryptTokens(blob, other)).toThrow();
  });

  test('roundtrips an 8KB payload and UTF-8 content', () => {
    const big = { blob: 'x'.repeat(8192), unicode: '日本語 — café — 🚀' };
    expect(decryptTokens(encryptTokens(big, key), key)).toEqual(big);
  });
});
