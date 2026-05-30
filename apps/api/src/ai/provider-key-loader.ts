import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Force-load AI provider keys from the local `.env` into `process.env`.
 *
 * Why this exists: a launcher in the dev chain (the Nest CLI / shell) pre-sets
 * these vars to an empty string, and `@nestjs/config` never overrides an
 * already-present var — so real keys placed in `.env` were silently shadowed by
 * the empty value. This loader treats the local `.env` as the source of truth
 * for the AI keys and overrides an empty/unset value (but never a real one set
 * intentionally in the environment, e.g. in production).
 */

const AI_KEYS = ['GEMINI_API_KEYS', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const;

/** Read a single `KEY=value` from .env text (last occurrence wins). Pure. */
export function extractEnvValue(envText: string, key: string): string | undefined {
  const matches = [...envText.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))];
  const last = matches[matches.length - 1];
  return last?.[1];
}

/** Apply file values to `env` for any AI key that is currently empty/unset. Pure. */
export function applyKeysToEnv(env: Record<string, string | undefined>, envText: string): string[] {
  const loaded: string[] = [];
  for (const key of AI_KEYS) {
    const val = extractEnvValue(envText, key);
    if (val && val.length > 0 && !env[key]) {
      env[key] = val;
      loaded.push(key);
    }
  }
  return loaded;
}

/** Side-effecting entry point: load `${cwd}/.env` AI keys into process.env. No-op if absent. */
export function ensureProviderKeysLoaded(cwd: string = process.cwd()): string[] {
  let text: string;
  try {
    text = readFileSync(resolve(cwd, '.env'), 'utf8');
  } catch {
    return []; // no local .env (e.g. production uses real env vars)
  }
  return applyKeysToEnv(process.env, text);
}
