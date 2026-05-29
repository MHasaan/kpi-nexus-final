import { describe, expect, it } from 'vitest';

import { decryptConfig, encryptConfig } from './notification-crypto.js';

describe('notification-crypto (AES-256-GCM)', () => {
  it('round-trips an object', () => {
    const cfg = { webhookUrl: 'https://hooks.slack.com/x', channel: '#ops' };
    const enc = encryptConfig(cfg);
    expect(decryptConfig(enc)).toEqual(cfg);
  });

  it('produces a versioned 4-segment ciphertext', () => {
    const enc = encryptConfig({ a: 1 });
    const parts = enc.split('.');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('v1');
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encryptConfig({ secret: 'same' });
    const b = encryptConfig({ secret: 'same' });
    expect(a).not.toBe(b);
    expect(decryptConfig(a)).toEqual(decryptConfig(b));
  });

  it('throws when the ciphertext is tampered', () => {
    const enc = encryptConfig({ token: 'abc' });
    const parts = enc.split('.');
    // Flip a character in the ciphertext segment.
    const tampered = parts[3]!.startsWith('A') ? 'B' + parts[3]!.slice(1) : 'A' + parts[3]!.slice(1);
    const bad = [parts[0], parts[1], parts[2], tampered].join('.');
    expect(() => decryptConfig(bad)).toThrow();
  });

  it('throws on malformed input', () => {
    expect(() => decryptConfig('not-valid')).toThrow('Malformed encrypted config');
    expect(() => decryptConfig('v2.a.b.c')).toThrow('Malformed encrypted config');
  });

  it('handles empty/undefined config', () => {
    expect(decryptConfig(encryptConfig(undefined))).toEqual({});
    expect(decryptConfig(encryptConfig({}))).toEqual({});
  });
});
