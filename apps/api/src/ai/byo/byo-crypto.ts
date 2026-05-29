import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM encryption for bring-your-own AI provider keys at rest. Pure (no
 * Nest/Prisma) so the crypto is unit-testable in isolation.
 *
 * The envelope carries a `kmsKeyId` — a stable hash of the master key — so a
 * later master-key rotation is *detected* (we know we can't decrypt) rather than
 * silently producing garbage. The master key is normalized to 32 bytes via
 * SHA-256, so any-length passphrase works in dev while a real 32-byte key is
 * required in production.
 */

export interface CryptoEnvelope {
  v: 1;
  kmsKeyId: string;
  iv: string;
  tag: string;
  ct: string;
}

export interface MasterKey {
  key: Buffer;
  kmsKeyId: string;
}

/** Thrown when an envelope was sealed under a different master key. */
export class KeyRotationError extends Error {
  constructor(envelopeKeyId: string, currentKeyId: string) {
    super(`BYO key sealed under kmsKeyId ${envelopeKeyId} but current key is ${currentKeyId}`);
    this.name = 'KeyRotationError';
  }
}

const DEV_DEFAULT = 'dev-encryption-key-32-bytes-long-replace';

/** Normalize any secret to a 32-byte key + derive its stable 8-byte-hex id. */
export function deriveMasterKey(raw: string): MasterKey {
  const key = createHash('sha256').update(raw, 'utf8').digest();
  // kmsKeyId is a *separate* hash of the derived key so it never leaks key bytes.
  const kmsKeyId = createHash('sha256').update(key).digest('hex').slice(0, 16);
  return { key, kmsKeyId };
}

/**
 * Resolve the platform master key from env. In production the dev default is
 * refused and the key must be a real 32-byte value (≥32 chars hex/base64);
 * outside production it falls back to the dev default for convenience.
 */
export function loadMasterKey(env: Record<string, string | undefined> = process.env): MasterKey {
  const isProd = (env.ENV ?? env.NODE_ENV) === 'production';
  const raw = env.BYO_ENCRYPTION_KEY ?? DEV_DEFAULT;
  if (isProd) {
    if (raw === DEV_DEFAULT) {
      throw new Error('BYO_ENCRYPTION_KEY must be set to a real 32-byte key in production');
    }
    if (raw.length < 32) {
      throw new Error('BYO_ENCRYPTION_KEY must be at least 32 bytes in production');
    }
  }
  return deriveMasterKey(raw);
}

export function encryptSecret(plaintext: string, master: MasterKey): CryptoEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', master.key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    v: 1,
    kmsKeyId: master.kmsKeyId,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ct: ct.toString('base64url'),
  };
}

export function decryptSecret(env: CryptoEnvelope, master: MasterKey): string {
  if (env.kmsKeyId !== master.kmsKeyId) {
    throw new KeyRotationError(env.kmsKeyId, master.kmsKeyId);
  }
  const decipher = createDecipheriv('aes-256-gcm', master.key, Buffer.from(env.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(env.tag, 'base64url'));
  const pt = Buffer.concat([decipher.update(Buffer.from(env.ct, 'base64url')), decipher.final()]);
  return pt.toString('utf8');
}
