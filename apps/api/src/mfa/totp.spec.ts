import { describe, expect, test } from 'vitest';

import {
  base32Decode,
  base32Encode,
  generateOtpAuthUrl,
  generateRecoveryCodes,
  generateSecret,
  generateTotp,
  verifyTotp,
} from './totp.js';

// RFC 6238 Appendix B test vectors (SHA-1, 8-digit) — we use 6-digit here
// so the canonical comparison is against the SHA-1 column truncated to 6.
// We verify with the canonical 20-byte secret "12345678901234567890" (ASCII).
const RFC_SECRET_BASE32 = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP — RFC 6238 vectors (SHA-1, 6-digit, 30-second step)', () => {
  // RFC 6238 Appendix B Table 1: SHA-1 column, 8-digit values; the lower 6
  // digits are what `generateTotp` returns at the same time.
  const cases: Array<[seconds: number, expected: string]> = [
    [59, '287082'],
    [1111111109, '081804'],
    [1111111111, '050471'],
    [1234567890, '005924'],
    [2000000000, '279037'],
  ];

  test.each(cases)('t=%i → %s', (seconds, expected) => {
    expect(generateTotp(RFC_SECRET_BASE32, { now: seconds * 1000 })).toBe(expected);
  });

  test('verifyTotp accepts current code', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp('081804', RFC_SECRET_BASE32, { now })).toBe(true);
  });

  test('verifyTotp accepts code from one step earlier (window=1)', () => {
    const now = 1111111109 * 1000;
    const prevWindowCode = generateTotp(RFC_SECRET_BASE32, { now: now - 30000 });
    expect(verifyTotp(prevWindowCode, RFC_SECRET_BASE32, { now })).toBe(true);
  });

  test('verifyTotp accepts code from one step later (window=1)', () => {
    const now = 1111111109 * 1000;
    const nextWindowCode = generateTotp(RFC_SECRET_BASE32, { now: now + 30000 });
    expect(verifyTotp(nextWindowCode, RFC_SECRET_BASE32, { now })).toBe(true);
  });

  test('verifyTotp rejects code from two steps away (outside window=1)', () => {
    const now = 1111111109 * 1000;
    const farCode = generateTotp(RFC_SECRET_BASE32, { now: now + 60000 });
    expect(verifyTotp(farCode, RFC_SECRET_BASE32, { now })).toBe(false);
  });

  test('verifyTotp rejects nonsense input', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp('000000', RFC_SECRET_BASE32, { now })).toBe(false);
    expect(verifyTotp('', RFC_SECRET_BASE32, { now })).toBe(false);
  });
});

describe('base32 encoding (round-trip)', () => {
  test('encodes and decodes arbitrary bytes', () => {
    const input = Buffer.from([0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef]);
    const encoded = base32Encode(input);
    expect(base32Decode(encoded)).toEqual(input);
  });

  test('handles empty buffer', () => {
    expect(base32Encode(Buffer.alloc(0))).toBe('');
    expect(base32Decode('')).toEqual(Buffer.alloc(0));
  });

  test('tolerates padding and whitespace on decode', () => {
    const original = Buffer.from('Hello');
    const encoded = base32Encode(original);
    expect(base32Decode(`${encoded}==`)).toEqual(original);
    expect(base32Decode(encoded.split('').join(' '))).toEqual(original);
  });
});

describe('secret + recovery code generation', () => {
  test('generateSecret returns a base32 string', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThan(20);
  });

  test('generateRecoveryCodes returns N unique 10-char base32 codes', () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z2-7]{10}$/));
  });
});

describe('otpauth URL', () => {
  test('produces a parseable otpauth URI', () => {
    const uri = generateOtpAuthUrl({
      secret: 'JBSWY3DPEHPK3PXP',
      account: 'alice@example.com',
      issuer: 'KPI Nexus',
    });
    expect(uri.startsWith('otpauth://totp/KPI%20Nexus:alice%40example.com?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=KPI+Nexus');
    expect(uri).toContain('algorithm=SHA1');
    expect(uri).toContain('digits=6');
    expect(uri).toContain('period=30');
  });
});
