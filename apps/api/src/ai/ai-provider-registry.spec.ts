import { AiProviderNotConfiguredError } from '@kpi-nexus/ai';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { AiProviderRegistry } from './ai-provider-registry.js';
import type { ByoKeyService } from './byo/byo-key.service.js';

// BE-026: fallbacks pointed at Claude with no ANTHROPIC_API_KEY, so every
// fallback made a doomed request that 401'd. An unconfigured provider is now
// refused up front (no network call), and the router logs it as NOT_CONFIGURED.
describe('AiProviderRegistry — unconfigured providers fail fast (BE-026)', () => {
  const byo = { getDecryptedKeyForOrg: vi.fn(async () => null) } as unknown as ByoKeyService;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each([
    ['CLAUDE', 'ANTHROPIC_API_KEY'],
    ['OPENAI', 'OPENAI_API_KEY'],
    ['GEMINI', 'GEMINI_API_KEYS'],
  ] as const)('%s with no %s → AiProviderNotConfiguredError', async (provider, envVar) => {
    vi.stubEnv('AI_MOCK', '0');
    vi.stubEnv(envVar, '');
    await expect(new AiProviderRegistry(byo).getProvider(provider)).rejects.toBeInstanceOf(AiProviderNotConfiguredError);
  });

  test('a configured provider is built as before', async () => {
    vi.stubEnv('AI_MOCK', '0');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test');
    await expect(new AiProviderRegistry(byo).getProvider('CLAUDE')).resolves.toMatchObject({ key: 'CLAUDE' });
  });
});
