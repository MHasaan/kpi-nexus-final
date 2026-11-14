import type { AiProviderKey } from '@kpi-nexus/contracts';

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
 * Ollama adapter for self-hosted local models. Talks `/api/chat` and
 * `/api/embed` against `OLLAMA_BASE_URL`. Local inference has no marginal cost,
 * so {@link complete} always reports `actualCost: 0` — the budget never blocks
 * it. Model ids keep their `ollama:` prefix end-to-end.
 */
export interface OllamaProviderOptions {
  baseUrl: string;
  fetchImpl?: FetchImpl;
}

export class OllamaProvider implements IAiProvider {
  readonly key: AiProviderKey = 'OLLAMA';
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchImpl;

  constructor(opts: OllamaProviderOptions) {
    this.baseUrl = opts.baseUrl;
    this.fetchImpl = resolveFetch(opts.fetchImpl);
  }

  private mapFinish(reason: string | undefined, hasTool: boolean): AiFinishReason {
    if (hasTool) return 'tool_use';
    return reason === 'length' ? 'length' : 'stop';
  }

  private async chat(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const model = requireModel(this.key, req.model);
    const messages = [
      ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
      ...req.messages.map((m) => {
        if (m.role === 'tool') return { role: 'tool', tool_name: m.toolName ?? '', content: m.content };
        if (m.role === 'assistant' && m.toolCalls?.length) {
          return { role: 'assistant', content: m.content, tool_calls: m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.input } })) };
        }
        return { role: m.role, content: m.content };
      }),
    ];
    const body: Record<string, unknown> = { model, messages, stream: false };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw httpError(this.key, res.status, await safeText(res));

    const data = (await res.json()) as {
      message?: {
        content?: string;
        tool_calls?: Array<{ function: { name: string; arguments: object } }>;
      };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const toolCalls: NormalizedToolCall[] = (data.message?.tool_calls ?? []).map((tc, i) => ({
      id: `ollama-tool-${i}`,
      name: tc.function.name,
      input: tc.function.arguments,
    }));

    return {
      content: data.message?.content ?? '',
      ...(toolCalls.length ? { toolCalls } : {}),
      finishReason: this.mapFinish(data.done_reason, toolCalls.length > 0),
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
      actualCost: 0,
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
    yield { finishReason: result.finishReason === 'content_filter' ? 'stop' : result.finishReason, usage: result.usage };
  }

  async embed(req: AiEmbeddingRequest): Promise<number[][]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: req.model, input: req.texts }),
    });
    if (!res.ok) throw httpError(this.key, res.status, await safeText(res));
    const data = (await res.json()) as { embeddings?: number[][] };
    return data.embeddings ?? [];
  }

  capabilities(): AiCapabilities {
    return { tools: true, streaming: true, embeddings: true, promptCaching: false };
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: 'GET' });
      return { ok: res.ok, latencyMs: 0 };
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
