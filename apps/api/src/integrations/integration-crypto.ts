import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Pure AES-256-GCM crypto for integration provider tokens at rest. No Nest /
 * Prisma so it is unit-testable in isolation. Ciphertext layout is a single
 * base64 string of `IV(12) ‖ tag(16) ‖ ciphertext`.
 *
 * The master key is resolved from `INTEGRATION_CRYPTO_KEY`, accepting a 32-byte
 * hex (64 chars) or base64 value directly, or deriving a 32-byte key from any
 * other passphrase via SHA-256 (dev convenience). KMS-ready: swap loadMasterKey
 * for an AWS KMS data-key fetch without touching encrypt/decrypt.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEV_DEFAULT = 'dev-integration-crypto-key-change-me';

export function loadMasterKey(env: Record<string, string | undefined> = process.env): Buffer {
  const isProd = (env.ENV ?? env.NODE_ENV) === 'production';
  const raw = env.INTEGRATION_CRYPTO_KEY;

  if (!raw) {
    if (isProd) throw new Error('INTEGRATION_CRYPTO_KEY must be set in production');
    return sha256(DEV_DEFAULT);
  }

  // 64-char hex → exactly 32 bytes.
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // base64 that decodes to exactly 32 bytes.
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  }
  // Anything else: derive deterministically from the passphrase.
  return sha256(raw);
}

export function encryptTokens(tokens: unknown, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptTokens<T = Record<string, unknown>>(blob: string, key: Buffer): T {
  const raw = Buffer.from(blob, 'base64');
  if (raw.length <= IV_BYTES + TAG_BYTES) {
    throw new Error('Integration token ciphertext is too short');
  }
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ct = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}

function sha256(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest();
}
