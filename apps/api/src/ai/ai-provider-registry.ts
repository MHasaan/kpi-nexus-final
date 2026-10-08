import { Injectable } from '@nestjs/common';
import {
  AiProviderNotConfiguredError,
  ClaudeProvider,
  GeminiProvider,
  type IAiProvider,
  MockProvider,
  OllamaProvider,
  OpenAiProvider,
} from '@kpi-nexus/ai';
import type { AiProviderKey } from '@kpi-nexus/contracts';

import { RequestContextStore } from '../tenancy/request-context.js';
import { ByoKeyService } from './byo/byo-key.service.js';

/**
 * Resolves a usable {@link IAiProvider} for a given vendor, preferring a
 * tenant's bring-your-own key over the platform env key. In mock mode
 * (`AI_MOCK=1` or `AI_MOCK_RESPONSE` set) every vendor resolves to a
 * deterministic {@link MockProvider} so tests + keyless local dev work offline.
 */
@Injectable()
export class AiProviderRegistry {
  constructor(private readonly byo: ByoKeyService) {}

  private get mockMode(): boolean {
    return process.env.AI_MOCK === '1' || process.env.AI_MOCK_RESPONSE !== undefined;
  }

  async getProvider(key: AiProviderKey): Promise<IAiProvider> {
    if (this.mockMode) {
      return new MockProvider({ key, cannedResponse: process.env.AI_MOCK_RESPONSE });
    }

    // BYO key takes precedence when the org has configured one.
    const ctx = RequestContextStore.get();
    if (ctx) {
      const byoKey = await this.byo.getDecryptedKeyForOrg(ctx.organizationId, key);
      if (byoKey) return this.build(key, byoKey);
    }
    return this.buildPlatform(key);
  }

  private build(key: AiProviderKey, apiKey: string): IAiProvider {
    switch (key) {
      case 'CLAUDE':
        return new ClaudeProvider({ apiKey });
      case 'OPENAI':
        return new OpenAiProvider({ apiKey });
      case 'GEMINI':
        return new GeminiProvider({ apiKeys: [apiKey] });
      case 'OLLAMA':
        return new OllamaProvider({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434' });
    }
  }

  /**
   * Platform-keyed provider. With no key configured it throws
   * AiProviderNotConfiguredError up front instead of building a client that
   * would make a doomed, 401-ing request (BE-026: every fallback to a keyless
   * Claude did exactly that).
   */
  private buildPlatform(key: AiProviderKey): IAiProvider {
    switch (key) {
      case 'CLAUDE': {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
        if (!apiKey) throw new AiProviderNotConfiguredError(key);
        return new ClaudeProvider({ apiKey });
      }
      case 'OPENAI': {
        const apiKey = process.env.OPENAI_API_KEY?.trim();
        if (!apiKey) throw new AiProviderNotConfiguredError(key);
        return new OpenAiProvider({ apiKey });
      }
      case 'GEMINI': {
        const apiKeys = (process.env.GEMINI_API_KEYS ?? '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        if (apiKeys.length === 0) throw new AiProviderNotConfiguredError(key);
        return new GeminiProvider({ apiKeys });
      }
      case 'OLLAMA':
        return new OllamaProvider({ baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434' });
    }
  }
}
