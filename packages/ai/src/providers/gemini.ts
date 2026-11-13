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
  /** Deadline for one completion call (all key attempts), ms. */
  timeoutMs?: number;
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
  private readonly timeoutMs: number;
  private cursor = 0;
  /** key → epoch-ms until which it stays parked after a 429. */
  private readonly parkedUntil = new Map<string, number>();
  /**
   * `${key}|${model}` pairs where that key answered 404 for that model (e.g.
   * "model … is no longer available to new users" — per-account, not global).
   * Skipped for that model only; the key still serves other models (BE-026).
   */
  private readonly unavailableFor = new Map<string, number>();
  private static readonly UNAVAILABLE_TTL_MS = 60 * 60 * 1000;
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
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  /**
   * Next usable key, round-robin: not parked (429 cooldown) and, when a model is
   * given, not known to 404 for that model. Throws if the pool is empty.
   */
  private nextKey(model?: string): string {
    if (this.apiKeys.length === 0) {
      throw new AiProviderError('Gemini has no API keys configured', this.key, false);
    }
    const now = this.now();
    for (let i = 0; i < this.apiKeys.length; i += 1) {
      const candidate = this.apiKeys[this.cursor % this.apiKeys.length]!;
      this.cursor += 1;
      const parked = this.parkedUntil.get(candidate);
      const gone = model ? this.unavailableFor.get(`${candidate}|${model}`) : undefined;
      if ((parked === undefined || parked <= now) && (gone === undefined || gone <= now)) return candidate;
    }
    // All parked → use the next one anyway (better to try than to hard-fail).
    const fallback = this.apiKeys[this.cursor % this.apiKeys.length]!;
    this.cursor += 1;
    return fallback;
  }

  /**
   * Key-level failures mean a *different* key may succeed — so the same request
   * rotates to the next key: quota-exhausted 429, invalid/forbidden key 401/403,
   * and 404 "model not available" (model access is per account — some keys
   * lose a model before others; BE-026). Other 4xx (bad request) and 5xx are
   * NOT key-specific, so we surface them immediately rather than burning the pool.
   */
  private isKeyLevelStatus(status: number): boolean {
    return status === 429 || status === 401 || status === 403 || status === 404;
  }

  /**
   * Run a request across the key pool with intra-request failover: try a key,
   * and on a key-level error park it (if rate-limited) and retry the same call
   * with the next available key, until one succeeds or every key is exhausted.
   * `makeUrl` injects the chosen key; `init` is identical across attempts.
   */
  private async fetchWithKeyFailover(
    model: string,
    makeUrl: (apiKey: string) => string,
    init: RequestInit,
  ): Promise<Response> {
    if (this.apiKeys.length === 0) {
      throw new AiProviderError('Gemini has no API keys configured', this.key, false);
    }
    const tried = new Set<string>();
    let lastError: AiProviderError | undefined;

    for (let attempt = 0; attempt < this.apiKeys.length; attempt += 1) {
      const apiKey = this.nextKey(model);
      if (tried.has(apiKey)) break; // pool cycled (all remaining parked) → stop
      tried.add(apiKey);

      let res: Response;
      try {
        res = (await this.fetchImpl(makeUrl(apiKey), init)) as Response;
      } catch (err) {
        // Our own deadline: the model is slow, not the key — fail fast as
        // retryable so the caller falls back instead of waiting on every key.
        if (this.isTimeout(err)) throw this.timeoutError();
        // Network failure — transient; try the next key.
        lastError = new AiProviderError(`Gemini network error: ${String(err)}`, this.key, true);
        continue;
      }

      if (res.ok) return res;

      const detail = await safeText(res);
      if (this.isKeyLevelStatus(res.status)) {
        if (res.status === 429) this.parkedUntil.set(apiKey, this.now() + this.cooldownMs);
        if (res.status === 404) {
          this.unavailableFor.set(`${apiKey}|${model}`, this.now() + GeminiProvider.UNAVAILABLE_TTL_MS);
        }
        lastError = httpError(this.key, res.status, detail);
        continue; // this key is exhausted/invalid → try the next one
      }
      // Request-level (4xx) or server (5xx): not key-specific — don't burn the pool.
      throw httpError(this.key, res.status, detail);
    }

    // Every key errored at the key level.
    throw lastError ?? new AiProviderError('Gemini: all API keys exhausted', this.key, true, 429);
  }

  private isTimeout(err: unknown): boolean {
    return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
  }

  private timeoutError(): AiProviderError {
    return new AiProviderError(`Gemini request timed out after ${this.timeoutMs} ms`, this.key, true);
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
    // Gemini counts thinking tokens against maxOutputTokens, so reasoning gets
    // its own budget added on top of the answer's. A zero/absent budget sends no
    // thinkingConfig (flash-lite rejects thinkingBudget: 0 and doesn't think by
    // default anyway).
    const reasoning = req.reasoningBudgetTokens && req.reasoningBudgetTokens > 0 ? req.reasoningBudgetTokens : 0;
    if (req.maxTokens !== undefined || req.temperature !== undefined || reasoning > 0) {
      body.generationConfig = {
        ...(req.maxTokens !== undefined ? { maxOutputTokens: req.maxTokens + reasoning } : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(reasoning > 0 ? { thinkingConfig: { thinkingBudget: reasoning } } : {}),
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
    const res = await this.fetchWithKeyFailover(
      model,
      (apiKey) => `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(this.buildBody(req)),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );

    type GenerateResponse = {
      candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    // The deadline covers the body too.
    const data = (await res.json().catch((err: unknown) => {
      throw this.isTimeout(err) ? this.timeoutError() : err;
    })) as GenerateResponse;

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
    // The model id is the real Gemini embedding model (e.g. gemini-embedding-001);
    // used verbatim apart from a leading `models/`. outputDimensionality is fixed
    // at 768 so the result fits the `embedding_gemini vector(768)` pgvector column.
    const embedModel = req.model.replace(/^models\//, '');
    const res = await this.fetchWithKeyFailover(
      embedModel,
      (apiKey) => `${this.baseUrl}/models/${embedModel}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: req.texts.map((text) => ({
            model: `models/${embedModel}`,
            content: { parts: [{ text }] },
            outputDimensionality: 768,
          })),
        }),
      },
    );
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
