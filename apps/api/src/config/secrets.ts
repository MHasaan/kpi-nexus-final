/**
 * Secrets that have a dev-only fallback (OT-008).
 *
 * Several secrets used to fall back to a hard-coded value — which is in the
 * public repo — even in production, so a deployment that forgot a variable
 * silently encrypted / signed with a known key. Same rule as BYO_ENCRYPTION_KEY
 * (ai/byo/byo-crypto.ts): outside production the dev default keeps local work
 * friction-free; in production a missing, default or short secret is refused.
 * `assertProductionSecrets()` runs at boot so a bad deploy fails immediately,
 * not on the first request that needs the secret.
 */

type Env = Record<string, string | undefined>;

export interface SecretSpec {
  /** Primary env var. */
  name: string;
  /** Fallback env vars, tried in order (each a real secret, never a literal). */
  aliases?: readonly string[];
  /** Used outside production only. */
  devDefault: string;
}

const MIN_PROD_LENGTH = 32;

const isProduction = (env: Env) => (env.ENV ?? env.NODE_ENV) === 'production';

export function resolveSecret(spec: SecretSpec, env: Env = process.env): string {
  const value = [spec.name, ...(spec.aliases ?? [])].map((k) => env[k]).find((v) => v !== undefined && v !== '');
  if (!isProduction(env)) return value ?? spec.devDefault;

  const names = [spec.name, ...(spec.aliases ?? [])].join(' or ');
  if (value === undefined) throw new Error(`${names} must be set in production`);
  if (value === spec.devDefault) throw new Error(`${spec.name} must not be the dev default in production`);
  if (value.length < MIN_PROD_LENGTH) {
    throw new Error(`${spec.name} must be at least ${MIN_PROD_LENGTH} characters in production`);
  }
  return value;
}

export const NOTIFICATION_KEY_SPEC: SecretSpec = {
  name: 'NOTIFICATION_ENCRYPTION_KEY',
  aliases: ['BYO_ENCRYPTION_KEY'],
  devDefault: 'dev-only-notification-key-change-me',
};
export const ML_HMAC_SPEC: SecretSpec = { name: 'ML_SIDECAR_HMAC_SECRET', devDefault: 'dev-ml-shared-secret' };
export const ONBOARDING_DRAFT_SPEC: SecretSpec = {
  name: 'ONBOARDING_DRAFT_SECRET',
  aliases: ['JWT_SECRET'],
  devDefault: 'dev-onboarding-secret',
};
export const EMBED_TOKEN_SPEC: SecretSpec = {
  name: 'EMBED_TOKEN_SECRET',
  devDefault: 'dev-embed-secret-change-me-in-prod',
};

/**
 * JWT_SECRET has no code fallback (JwtStrategy requires it to be set), but the
 * value in .env.example is public — a deploy copied from the template would
 * sign tokens with it. Boot check only; the app reads it via ConfigService.
 */
export const JWT_SECRET_SPEC: SecretSpec = { name: 'JWT_SECRET', devDefault: 'dev-jwt-secret-change-in-prod' };

export const SECRET_SPECS: readonly SecretSpec[] = [
  JWT_SECRET_SPEC,
  NOTIFICATION_KEY_SPEC,
  ML_HMAC_SPEC,
  ONBOARDING_DRAFT_SPEC,
  EMBED_TOKEN_SPEC,
];

/** Boot-time check: throws once, listing every problem, in production. */
export function assertProductionSecrets(env: Env = process.env): void {
  if (!isProduction(env)) return;
  const problems: string[] = [];
  for (const spec of [...SECRET_SPECS].sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      resolveSecret(spec, env);
    } catch (err) {
      problems.push((err as Error).message);
    }
  }
  if (problems.length) throw new Error(`Refusing to start — insecure secrets:\n  - ${problems.join('\n  - ')}`);
}
