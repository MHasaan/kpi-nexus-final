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
 * Google Gemini adapter (the FYP default — free tier). Talks the v1beta REST
 * surface (`:generateContent`, `:streamGenerateContent`, `:batchEmbedContents`)
 * and round-robins a pool of API keys, parking a key on cooldown when it 429s so
 * later calls skip it. Gemini uses `user`/`model` roles (we map `assistant` →
 * `model`) and emits tool calls as `functionCall` parts.
 */
export interface GeminiProviderOptions {
  apiKeys: string[];
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  /** How long a 429'd key stays parked, ms. */
  cooldownMs?: number;
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: object };
}

export class GeminiProvider implements IAiProvider {
  readonly key: AiProviderKey = 'GEMINI';
  private readonly apiKeys: string[];
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;
  private readonly cooldownMs: number;
  private cursor = 0;
  /** key → epoch-ms until which it stays parked after a 429. */
  private readonly parkedUntil = new Map<string, number>();
  /** Monotonic clock; tests can't use Date.now via the harness so default 0. */
  private now: () => number = () => {
    try {
      return Date.now();
    } catch {
      return 0;
    }
  };

  constructor(opts: GeminiProviderOptions) {
    this.apiKeys = opts.apiKeys;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE;
    this.fetchImpl = resolveFetch(opts.fetchImpl);
    this.cooldownMs = opts.cooldownMs ?? 60_000;
  }

  /** Next non-parked key, round-robin. Throws if the pool is empty. */
  private nextKey(): string {
    if (this.apiKeys.length === 0) {
      throw new AiProviderError('Gemini has no API keys configured', this.key, false);
    }
    const now = this.now();
    for (let i = 0; i < this.apiKeys.length; i += 1) {
      const candidate = this.apiKeys[this.cursor % this.apiKeys.length]!;
      this.cursor += 1;
      const parked = this.parkedUntil.get(candidate);
      if (parked === undefined || parked <= now) return candidate;
    }
    // All parked → use the next one anyway (better to try than to hard-fail).
    const fallback = this.apiKeys[this.cursor % this.apiKeys.length]!;
    this.cursor += 1;
    return fallback;
  }

  private mapFinish(reason: string | undefined, hasToolCall: boolean): AiFinishReason {
    if (hasToolCall) return 'tool_use';
    switch (reason) {
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'stop';
    }
  }

  private buildBody(req: AiCompletionRequest): object {
    const body: Record<string, unknown> = {
      contents: req.messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    };
    if (req.systemPrompt) {
      body.system_instruction = { parts: [{ text: req.systemPrompt }] };
    }
    if (req.maxTokens !== undefined || req.temperature !== undefined) {
      body.generationConfig = {
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      };
    }
    if (req.tools?.length) {
      body.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          })),
        },
      ];
    }
    return body;
  }

  private async generate(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const model = requireModel(this.key, req.model);
    const apiKey = this.nextKey();
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.buildBody(req)),
    });

    if (!res.ok) {
      if (res.status === 429) this.parkedUntil.set(apiKey, this.now() + this.cooldownMs);
      throw httpError(this.key, res.status, await safeText(res));
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const content = parts
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    const toolCalls: NormalizedToolCall[] = parts
      .filter((p): p is { functionCall: { name: string; args: object } } => Boolean(p.functionCall))
      .map((p, i) => ({ id: `gemini-tool-${i}`, name: p.functionCall.name, input: p.functionCall.args }));

    const usage = {
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };

    return {
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      finishReason: this.mapFinish(data.candidates?.[0]?.finishReason, toolCalls.length > 0),
      usage,
      actualCost: priceCall(model, usage),
    };
  }

  complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.generate(req);
  }

  completeWithTools(req: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.generate(req);
  }

  async *stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    // Gemini SSE streaming is parsed line-by-line; for now we proxy a single
    // non-streamed result as one chunk (full streaming lands with the NLQ UI).
    const result = await this.generate(req);
    if (result.content) yield { delta: result.content };
    yield {
      finishReason: result.finishReason === 'content_filter' ? 'stop' : result.finishReason,
      usage: result.usage,
    };
  }

  async embed(req: AiEmbeddingRequest): Promise<number[][]> {
    const apiKey = this.nextKey();
    // text-embedding-004 is the canonical embed model; strip our `gemini-` prefix.
    const embedModel = req.model.replace(/^gemini-/, '');
    const url = `${this.baseUrl}/models/${embedModel}:batchEmbedContents?key=${apiKey}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requests: req.texts.map((text) => ({
          model: `models/${embedModel}`,
          content: { parts: [{ text }] },
        })),
      }),
    });
    if (!res.ok) {
      if (res.status === 429) this.parkedUntil.set(apiKey, this.now() + this.cooldownMs);
      throw httpError(this.key, res.status, await safeText(res));
    }
    const data = (await res.json()) as { embeddings?: Array<{ values: number[] }> };
    return (data.embeddings ?? []).map((e) => e.values);
  }

  capabilities(): AiCapabilities {
    return { tools: true, streaming: true, embeddings: true, promptCaching: false };
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const start = this.now();
    try {
      const apiKey = this.nextKey();
      const res = await this.fetchImpl(`${this.baseUrl}/models?key=${apiKey}`, { method: 'GET' });
      return { ok: res.ok, latencyMs: this.now() - start };
    } catch {
      return { ok: false, latencyMs: this.now() - start };
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
