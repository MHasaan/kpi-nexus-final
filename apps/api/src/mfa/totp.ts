import { createHmac, randomBytes } from 'node:crypto';

/**
 * Pure-Node TOTP per RFC 6238 + RFC 4226. SHA-1 HMAC, 30-second step,
 * 6-digit codes, ±1 step verification window (i.e. ±30s tolerance).
 *
 * No external dependencies. Verified against the RFC 6238 test vectors.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DEFAULT_STEP = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1;

export function generateSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

export function generateTotp(
  secretBase32: string,
  options: { now?: number; step?: number; digits?: number } = {},
): string {
  const step = options.step ?? DEFAULT_STEP;
  const digits = options.digits ?? DEFAULT_DIGITS;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const counter = Math.floor(nowSeconds / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

export function verifyTotp(
  token: string,
  secretBase32: string,
  options: { now?: number; step?: number; digits?: number; window?: number } = {},
): boolean {
  const step = options.step ?? DEFAULT_STEP;
  const digits = options.digits ?? DEFAULT_DIGITS;
  const window = options.window ?? DEFAULT_WINDOW;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const counter = Math.floor(nowSeconds / step);
  const secret = base32Decode(secretBase32);
  for (let w = -window; w <= window; w++) {
    if (constantTimeEqual(token, hotp(secret, counter + w, digits))) {
      return true;
    }
  }
  return false;
}

export function generateOtpAuthUrl(args: {
  secret: string;
  account: string;
  issuer: string;
  digits?: number;
  step?: number;
}): string {
  const label = `${encodeURIComponent(args.issuer)}:${encodeURIComponent(args.account)}`;
  const params = new URLSearchParams({
    secret: args.secret,
    issuer: args.issuer,
    algorithm: 'SHA1',
    digits: String(args.digits ?? DEFAULT_DIGITS),
    period: String(args.step ?? DEFAULT_STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Generate `count` recovery codes — random 10-char base32 strings. */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    return base32Encode(bytes).slice(0, 10);
  });
}

// =============================================================================
// Internal helpers
// =============================================================================

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base32 character: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Time-constant string equality to avoid leaking length/match via timing. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
