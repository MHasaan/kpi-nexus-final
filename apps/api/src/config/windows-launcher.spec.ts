import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

/**
 * OT-017: setupScripts/start.ps1 is the one-shot Windows launcher. On a fresh
 * clone there are no .env files, and `pnpm db:setup` (`node --env-file=.env`)
 * and the ML sidecar (`uvicorn --env-file .env`) both stop dead without them.
 * Static checks only — PowerShell doesn't run in CI; the real test is a cold
 * run on Windows.
 */

const ROOT = new URL('../../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

const script = read('setupScripts/start.ps1');
const ENV_FILES = ['.env', 'apps\\api\\.env', 'apps\\web\\.env', 'apps\\ml\\.env'];

describe('Windows launcher (start.ps1)', () => {
  test.each(ENV_FILES)('creates %s from its .env.example', (file) => {
    expect(script).toContain(`'${file}'`);
  });

  test('copies templates only when the .env is missing (never overwrites)', () => {
    expect(script).toMatch(/if \(-not \(Test-Path \$target\)\)/);
    expect(script).toMatch(/Copy-Item \$template \$target/);
  });

  test('prepares the .env files before anything reads them', () => {
    const envStep = script.indexOf('Copy-Item $template $target');
    expect(envStep).toBeGreaterThan(-1);
    expect(envStep).toBeLessThan(script.indexOf('pnpm db:setup'));
    expect(envStep).toBeLessThan(script.indexOf('--env-file .env'));
  });
});
