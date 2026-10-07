import { describe, expect, test } from 'vitest';

import { SECRET_SPECS, assertProductionSecrets, resolveSecret } from './secrets.js';

const STRONG = 'x'.repeat(40);

describe('resolveSecret (OT-008)', () => {
  const spec = { name: 'EMBED_TOKEN_SECRET', devDefault: 'dev-embed-secret-change-me-in-prod' } as const;

  test('outside production: falls back to the dev default', () => {
    expect(resolveSecret(spec, {})).toBe(spec.devDefault);
    expect(resolveSecret(spec, { NODE_ENV: 'development' })).toBe(spec.devDefault);
  });

  test('uses the configured value, then aliases in order', () => {
    expect(resolveSecret(spec, { EMBED_TOKEN_SECRET: 'abc' })).toBe('abc');
    const aliased = { name: 'A', aliases: ['B', 'C'], devDefault: 'dev' };
    expect(resolveSecret(aliased, { C: 'from-c' })).toBe('from-c');
    expect(resolveSecret(aliased, { B: 'from-b', C: 'from-c' })).toBe('from-b');
  });

  test('production: refuses a missing secret (the public dev default is never used)', () => {
    expect(() => resolveSecret(spec, { NODE_ENV: 'production' })).toThrow(/EMBED_TOKEN_SECRET must be set/);
    expect(() => resolveSecret(spec, { ENV: 'production' })).toThrow(/EMBED_TOKEN_SECRET/);
  });

  test('production: refuses the dev default or a short value, accepts a strong one', () => {
    expect(() => resolveSecret(spec, { NODE_ENV: 'production', EMBED_TOKEN_SECRET: spec.devDefault })).toThrow(/dev default/);
    expect(() => resolveSecret(spec, { NODE_ENV: 'production', EMBED_TOKEN_SECRET: 'short' })).toThrow(/at least 32/);
    expect(resolveSecret(spec, { NODE_ENV: 'production', EMBED_TOKEN_SECRET: STRONG })).toBe(STRONG);
  });
});

describe('assertProductionSecrets', () => {
  test('covers the secrets that had public fallbacks, plus JWT_SECRET (its template value is public)', () => {
    expect(SECRET_SPECS.map((s) => s.name).sort()).toEqual(
      ['EMBED_TOKEN_SECRET', 'JWT_SECRET', 'ML_SIDECAR_HMAC_SECRET', 'NOTIFICATION_ENCRYPTION_KEY', 'ONBOARDING_DRAFT_SECRET'],
    );
  });

  test('no-op outside production', () => {
    expect(() => assertProductionSecrets({})).not.toThrow();
  });

  test('production: names EVERY missing secret at once, so a deploy is fixed in one pass', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'production' })).toThrow(
      /EMBED_TOKEN_SECRET[\s\S]*JWT_SECRET[\s\S]*ML_SIDECAR_HMAC_SECRET[\s\S]*NOTIFICATION_ENCRYPTION_KEY[\s\S]*ONBOARDING_DRAFT_SECRET/,
    );
  });

  test('production: the public .env.example JWT_SECRET is refused', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        JWT_SECRET: 'dev-jwt-secret-change-in-prod',
        EMBED_TOKEN_SECRET: STRONG,
        ML_SIDECAR_HMAC_SECRET: STRONG,
        NOTIFICATION_ENCRYPTION_KEY: STRONG,
        ONBOARDING_DRAFT_SECRET: STRONG,
      }),
    ).toThrow(/JWT_SECRET must not be the dev default/);
  });

  test('production: aliases count (BYO key for notifications, JWT secret for drafts)', () => {
    expect(() =>
      assertProductionSecrets({
        NODE_ENV: 'production',
        EMBED_TOKEN_SECRET: STRONG,
        ML_SIDECAR_HMAC_SECRET: STRONG,
        BYO_ENCRYPTION_KEY: STRONG,
        JWT_SECRET: STRONG,
      }),
    ).not.toThrow();
  });
});
