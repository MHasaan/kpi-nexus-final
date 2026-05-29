import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * AES-256-GCM encryption for notification-channel credentials at rest.
 *
 * The 32-byte key is derived (SHA-256) from `NOTIFICATION_ENCRYPTION_KEY`
 * (falls back to `BYO_ENCRYPTION_KEY`, then a dev default). Output format is
 * `v1.<iv>.<authTag>.<ciphertext>` with each segment base64url — versioned so
 * the scheme can rotate later. This is a stand-in for the P8
 * IntegrationCryptoService.
 */

const VERSION = 'v1';

function key(): Buffer {
  const raw =
    process.env.NOTIFICATION_ENCRYPTION_KEY ??
    process.env.BYO_ENCRYPTION_KEY ??
    'dev-only-notification-key-change-me';
  // Normalize any-length secret to exactly 32 bytes.
  return createHash('sha256').update(raw).digest();
}

/** Encrypt a JSON-serializable config object. Returns an opaque string. */
export function encryptConfig(config: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const plaintext = Buffer.from(JSON.stringify(config ?? {}), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/** Decrypt a string produced by encryptConfig. Throws on tamper/format error. */
export function decryptConfig<T = Record<string, unknown>>(encrypted: string): T {
  const parts = encrypted.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Malformed encrypted config');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64!, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64!, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}
