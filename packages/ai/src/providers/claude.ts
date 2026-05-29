import type { AiProviderKey } from '@kpi-nexus/contracts';

import { priceCall } from '../pricing.js';
import {
  type AiCapabilities,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiEmbeddingRequest,
  type AiFinishReason,
  AiProviderError,
  type AiStreamChunk,
  type IAiProvider,
  type NormalizedToolCall,
} from '../types.js';
import { type FetchImpl, httpError, requireModel, resolveFetch } from './http.js';

/**
 * Anthropic Claude adapter (the paid fallback for quality-sensitive features).
 * Talks the `/v1/messages` REST surface with prompt-caching + 1M-context betas,
 * placing `cache_control: ephemeral` on the system prompt when requested. Claude
 * has no embeddings endpoint, so {@link embed} throws — embeddings route to
 * OpenAI/Gemini instead.
 */
export interface ClaudeProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

const DEFAULT_BASE = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_BETA = 'prompt-caching-2024-07-31,context-1m-2025-08-07';

interface ClaudeBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: object;
}

export class ClaudeProvider implements IAiProvider {
  readonly key: AiProviderKey = 'CLAUDE';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: ClaudeProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = resolveFetch(opts.fetchImpl);
  }

  private mapFinish(reason: string | undefined): AiFinishReason {
    switch (reason) {
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }

  private buildBody(req: AiCompletionRequest, model: string): object {
    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? 1024,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.systemPrompt) {
      body.system =
        req.cacheControl === 'ephemeral'
          ? [{ type: 'text', text: req.systemPrompt, cache_control: { type: 'ephemeral' } }]
          : req.systemPrompt;
    }
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }
    return body;
  }

  private async messages(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const model = requireModel(this.key, req.model);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-beta': ANTHROPIC_BETA,
      },
      body: JSON.stringify(this.buildBody(req, model)),
    });
    if (!res.ok) throw httpError(this.key, res.status, await safeText(res));

    const data = (await res.json()) as {
      content?: ClaudeBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    };

    const blocks = data.content ?? [];
    const content = blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const toolCalls: NormalizedToolCall[] = blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id ?? '', name: b.name ?? '', input: b.input ?? {} }));

    const cached = data.usage?.cache_read_input_tokens ?? 0;
    const usage = {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      ...(cached ? { cachedTokens: cached } : {}),
    };

    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      finishReason: this.mapFinish(data.stop_reason),
      usage,
      actualCost: priceCall(model, usage),
    };
  }

  complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.messages(req);
  }

  completeWithTools(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.messages(req);
  }

  async *stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    const result = await this.messages(req);
    if (result.content) yield { delta: result.content };
    yield {
      finishReason: result.finishReason === 'content_filter' ? 'stop' : result.finishReason,
      usage: result.usage,
    };
  }

  async embed(_req: AiEmbeddingRequest): Promise<number[][]> {
    throw new AiProviderError('Claude does not provide embeddings', this.key, false);
  }

  capabilities(): AiCapabilities {
    return { tools: true, streaming: true, embeddings: false, promptCaching: true };
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    try {
      // A 1-token completion is the cheapest liveness probe Anthropic offers.
      await this.messages({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
      });
      return { ok: true, latencyMs: 0 };
    } catch {
      return { ok: false, latencyMs: 0 };
    }
  }
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}
