import { describe, expect, it } from 'vitest';

import { applyKeysToEnv, extractEnvValue } from './provider-key-loader.js';

describe('extractEnvValue', () => {
  it('reads a single KEY=value line', () => {
    expect(extractEnvValue('FOO=bar\nGEMINI_API_KEYS=a,b,c\n', 'GEMINI_API_KEYS')).toBe('a,b,c');
  });

  it('returns the last occurrence when duplicated', () => {
    expect(extractEnvValue('K=first\nK=second\n', 'K')).toBe('second');
  });

  it('returns undefined when the key is absent', () => {
    expect(extractEnvValue('OTHER=1\n', 'GEMINI_API_KEYS')).toBeUndefined();
  });
});

describe('applyKeysToEnv', () => {
  it('fills an AI key that is unset', () => {
    const env: Record<string, string | undefined> = {};
    const loaded = applyKeysToEnv(env, 'GEMINI_API_KEYS=k1,k2,k3\n');
    expect(env.GEMINI_API_KEYS).toBe('k1,k2,k3');
    expect(loaded).toContain('GEMINI_API_KEYS');
  });

  it('OVERRIDES an empty-string pre-set value (the bug being fixed)', () => {
    const env: Record<string, string | undefined> = { GEMINI_API_KEYS: '' };
    applyKeysToEnv(env, 'GEMINI_API_KEYS=real1,real2\n');
    expect(env.GEMINI_API_KEYS).toBe('real1,real2');
  });

  it('does NOT override a real (non-empty) pre-set value', () => {
    const env: Record<string, string | undefined> = { GEMINI_API_KEYS: 'env-provided' };
    const loaded = applyKeysToEnv(env, 'GEMINI_API_KEYS=file-value\n');
    expect(env.GEMINI_API_KEYS).toBe('env-provided');
    expect(loaded).not.toContain('GEMINI_API_KEYS');
  });

  it('ignores AI keys absent from the file', () => {
    const env: Record<string, string | undefined> = {};
    applyKeysToEnv(env, 'GEMINI_API_KEYS=x\n');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('does not set a key whose file value is empty', () => {
    const env: Record<string, string | undefined> = {};
    applyKeysToEnv(env, 'GEMINI_API_KEYS=\n');
    expect(env.GEMINI_API_KEYS ?? '').toBe('');
  });
});
