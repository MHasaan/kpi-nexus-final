import type { AiProviderKey } from '@kpi-nexus/contracts';

import type {
  AiCapabilities,
  AiCompletionRequest,
  AiCompletionResult,
  AiEmbeddingRequest,
  AiStreamChunk,
  IAiProvider,
  NormalizedToolCall,
} from '../types.js';

/**
 * Deterministic, network-free provider used for unit/e2e tests and local dev
 * (`AI_MOCK_RESPONSE`). Echoes a canned response, emits stable pseudo-random
 * embeddings derived from a string hash, and always costs $0. It impersonates a
 * real provider key so the router/registry treat it identically.
 */
export interface MockProviderOptions {
  key?: AiProviderKey;
  cannedResponse?: string;
  cannedToolCall?: NormalizedToolCall;
  embeddingDim?: number;
}

/** ~4 chars/token, matching how most tokenizers ballpark English. */
const estimateTokens = (s: string): number => Math.max(1, Math.ceil(s.length / 4));

/** Stable 32-bit string hash (FNV-1a) so embeddings are reproducible. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class MockProvider implements IAiProvider {
  readonly key: AiProviderKey;
  private readonly cannedResponse?: string;
  private readonly cannedToolCall?: NormalizedToolCall;
  private readonly embeddingDim: number;

  constructor(opts: MockProviderOptions = {}) {
    this.key = opts.key ?? 'GEMINI';
    this.cannedResponse = opts.cannedResponse;
    this.cannedToolCall = opts.cannedToolCall;
    this.embeddingDim = opts.embeddingDim ?? 768;
  }

  private answer(req: AiCompletionRequest): string {
    // The `AI_MOCK_RESPONSE` env override is applied by the apps/api registry,
    // which constructs this provider with the env value as `cannedResponse` —
    // packages/ai stays free of any Node/process dependency.
    if (this.cannedResponse !== undefined) return this.cannedResponse;
    const lastUser = [...req.messages].reverse().find((m) => m.role === 'user');
    return `MOCK: ${lastUser?.content ?? ''}`;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const content = this.answer(req);
    const inputTokens = estimateTokens(
      (req.systemPrompt ?? '') + req.messages.map((m) => m.content).join(''),
    );
    return {
      content,
      finishReason: 'stop',
      usage: { inputTokens, outputTokens: estimateTokens(content) },
      actualCost: 0,
    };
  }

  async completeWithTools(req: AiCompletionRequest): Promise<AiCompletionResult> {
    if (this.cannedToolCall) {
      return {
        content: '',
        toolCalls: [this.cannedToolCall],
        finishReason: 'tool_use',
        usage: { inputTokens: 1, outputTokens: 1 },
        actualCost: 0,
      };
    }
    return this.complete(req);
  }

  async *stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    const content = this.answer(req);
    const words = content.split(' ');
    for (let i = 0; i < words.length; i += 1) {
      // Prefix every word after the first with the separating space so the
      // deltas concatenate back to exactly `content`.
      yield { delta: i === 0 ? words[i] : ` ${words[i]}` };
    }
    yield {
      finishReason: 'stop',
      usage: {
        inputTokens: estimateTokens(req.messages.map((m) => m.content).join('')),
        outputTokens: estimateTokens(content),
      },
    };
  }

  async embed(req: AiEmbeddingRequest): Promise<number[][]> {
    return req.texts.map((text) => {
      const seed = hash(text);
      // Linear congruential generator seeded by the text hash → stable vector.
      let state = seed === 0 ? 1 : seed;
      return Array.from({ length: this.embeddingDim }, () => {
        state = (Math.imul(state, 1103515245) + 12345) >>> 0;
        return state / 0xffffffff - 0.5; // roughly [-0.5, 0.5]
      });
    });
  }

  capabilities(): AiCapabilities {
    return { tools: true, streaming: true, embeddings: true, promptCaching: true };
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    return { ok: true, latencyMs: 0 };
  }
}
