import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { SECRET_SPECS } from './secrets.js';

/**
 * Every key the API refuses to boot without in production must be listed in
 * both env templates (MV-003). INTEGRATION_CRYPTO_KEY and BYO_ENCRYPTION_KEY
 * are enforced by their own crypto loaders rather than SECRET_SPECS.
 * A commented placeholder (`# KEY=`) counts: optional-with-fallback keys are
 * documented that way.
 */
const PRODUCTION_KEYS = [...SECRET_SPECS.map((spec) => spec.name), 'INTEGRATION_CRYPTO_KEY', 'BYO_ENCRYPTION_KEY'];

const TEMPLATES = {
  '.env.example': new URL('../../../../.env.example', import.meta.url),
  'apps/api/.env.example': new URL('../../.env.example', import.meta.url),
};

function documentedKeys(path: URL): Set<string> {
  const keys = readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => /^#?\s*([A-Z0-9_]+)=/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
  return new Set(keys);
}

describe.each(Object.entries(TEMPLATES))('%s', (_name, path) => {
  test.each(PRODUCTION_KEYS)('documents %s', (key) => {
    expect(documentedKeys(path).has(key)).toBe(true);
  });
});

/**
 * The reverse direction for mail and object storage: every SMTP_ / S3_ key the
 * root template documents must be one the API actually reads. The template
 * once said SMTP_PASSWORD while the code read SMTP_PASS, so a deploy copied
 * from it sent mail without authentication (OT-011).
 */
describe('.env.example mail and storage keys', () => {
  const sources = [
    new URL('../email/email.service.ts', import.meta.url),
    new URL('../reports/services/storage.service.ts', import.meta.url),
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  const keys = [...documentedKeys(TEMPLATES['.env.example'])].filter((key) => /^(SMTP|S3)_/.test(key));

  test.each(keys)('%s is read by the API', (key) => {
    expect(sources).toContain(`process.env.${key}`);
  });
});
