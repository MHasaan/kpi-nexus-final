import { describe, expect, it } from 'vitest';

import {
  KeyRotationError,
  decryptSecret,
  deriveMasterKey,
  encryptSecret,
  loadMasterKey,
} from './byo-crypto.js';

const master = deriveMasterKey('a-test-master-key-of-decent-length');

describe('BYO key crypto (AES-256-GCM envelope)', () => {
  it('round-trips a secret', () => {
    const env = encryptSecret('sk-secret-api-key', master);
    expect(decryptSecret(env, master)).toBe('sk-secret-api-key');
  });

  it('uses a random IV so the same plaintext encrypts differently each time', () => {
    const a = encryptSecret('same', master);
    const b = encryptSecret('same', master);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
    // both still decrypt to the original
    expect(decryptSecret(a, master)).toBe('same');
    expect(decryptSecret(b, master)).toBe('same');
  });

  it('rejects a tampered ciphertext (GCM auth tag fails)', () => {
    const env = encryptSecret('secret', master);
    const tampered = { ...env, ct: env.ct.slice(0, -2) + (env.ct.endsWith('AA') ? 'BB' : 'AA') };
    expect(() => decryptSecret(tampered, master)).toThrow();
  });

  it('detects key rotation: an envelope sealed with another key throws KeyRotationError', () => {
    const env = encryptSecret('secret', master);
    const rotated = deriveMasterKey('a-completely-different-master-key');
    expect(() => decryptSecret(env, rotated)).toThrow(KeyRotationError);
  });

  it('stamps a stable kmsKeyId hash on the envelope', () => {
    const env = encryptSecret('secret', master);
    expect(env.kmsKeyId).toBe(master.kmsKeyId);
    expect(env.kmsKeyId).toMatch(/^[0-9a-f]{16}$/); // 8-byte hex
    // deriving the same raw key reproduces the same id
    expect(deriveMasterKey('a-test-master-key-of-decent-length').kmsKeyId).toBe(master.kmsKeyId);
  });

  it('loadMasterKey refuses the dev default when ENV=production', () => {
    expect(() =>
      loadMasterKey({ ENV: 'production', BYO_ENCRYPTION_KEY: 'dev-encryption-key-32-bytes-long-replace' }),
    ).toThrow(/production/i);
    // a real-looking key is accepted
    expect(loadMasterKey({ ENV: 'production', BYO_ENCRYPTION_KEY: 'f'.repeat(64) }).kmsKeyId).toMatch(
      /^[0-9a-f]{16}$/,
    );
  });

  it('loadMasterKey falls back to the dev default outside production', () => {
    const m = loadMasterKey({});
    expect(m.key).toHaveLength(32);
  });
});
