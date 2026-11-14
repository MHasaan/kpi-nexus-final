import type { AiProviderKey } from '@kpi-nexus/contracts';

import { priceCall } from '../pricing.js';
import type {
  AiCapabilities,
  AiCompletionRequest,
  AiCompletionResult,
  AiEmbeddingRequest,
  AiFinishReason,
  AiStreamChunk,
  IAiProvider,
  NormalizedToolCall,
} from '../types.js';
import { type FetchImpl, httpError, requireModel, resolveFetch } from './http.js';

/**
 * OpenAI adapter. Talks `/v1/chat/completions` (+ tools) and `/v1/embeddings`.
 * Our model ids carry an `openai-` prefix (so the price table is unambiguous);
 * it is stripped before hitting the API. `prompt_tokens_details.cached_tokens`
 * is captured so cached input is priced at the discounted rate.
 */
export interface OpenAiProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
}

const DEFAULT_BASE = 'https://api.openai.com';

const strip = (model: string): string => model.replace(/^openai-/, '');

export class OpenAiProvider implements IAiProvider {
  readonly key: AiProviderKey = 'OPENAI';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: OpenAiProviderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = resolveFetch(opts.fetchImpl);
  }

  private get authHeaders() {
    return { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` };
  }

  private mapFinish(reason: string | undefined): AiFinishReason {
    switch (reason) {
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private async chat(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const model = strip(requireModel(this.key, req.model));
    const messages = [
      ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
      ...req.messages.map((m) => {
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content };
        if (m.role === 'assistant' && m.toolCalls?.length) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.input) } })),
          };
        }
        return { role: m.role, content: m.content };
      }),
    ];
    const body: Record<string, unknown> = { model, messages };
    if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.authHeaders,
      body: JSON.stringify(body),
    });
    if (!res.ok) throw httpError(this.key, res.status, await safeText(res));

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

    const choice = data.choices?.[0];
    const toolCalls: NormalizedToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeJsonParse(tc.function.arguments),
    }));
    const cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      ...(cached ? { cachedTokens: cached } : {}),
    };

    return {
      content: choice?.message?.content ?? '',
      ...(toolCalls.length ? { toolCalls } : {}),
      finishReason: this.mapFinish(choice?.finish_reason),
      usage,
      actualCost: priceCall(`openai-${model}`, usage),
    };
  }

  complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.chat(req);
  }

  completeWithTools(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.chat(req);
  }

  async *stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    const result = await this.chat(req);
    if (result.content) yield { delta: result.content };
    yield {
      finishReason: result.finishReason === 'content_filter' ? 'stop' : result.finishReason,
      usage: result.usage,
    };
  }

  async embed(req: AiEmbeddingRequest): Promise<number[][]> {
    const model = strip(req.model);
    const res = await this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: this.authHeaders,
      body: JSON.stringify({ model, input: req.texts }),
    });
    if (!res.ok) throw httpError(this.key, res.status, await safeText(res));
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return (data.data ?? []).map((d) => d.embedding);
  }

  capabilities(): AiCapabilities {
    return { tools: true, streaming: true, embeddings: true, promptCaching: true };
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: this.authHeaders,
      });
      return { ok: res.ok, latencyMs: 0 };
    } catch {
      return { ok: false, latencyMs: 0 };
    }
  }
}

function safeJsonParse(s: string): object {
  try {
    return JSON.parse(s) as object;
  } catch {
    return {};
  }
}

async function safeText(res: { text: () => Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}
