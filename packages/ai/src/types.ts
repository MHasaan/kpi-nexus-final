import type { AiProviderKey } from '@kpi-nexus/contracts';

/**
 * Provider-agnostic AI surface. Each vendor adapter (Claude/Gemini/OpenAI/
 * Ollama) implements {@link IAiProvider}, normalizing its wire format to these
 * shared shapes so the router, budget, and feature modules never branch on
 * vendor. See docs/superpowers/plans/P5-ai-layer.md.
 */

export type { AiProviderKey };

/** A single turn in a chat completion. */
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool the model may call, described with a JSON-schema parameter spec. */
export interface NormalizedTool {
  name: string;
  description: string;
  parameters: object; // JSON schema
}

/** A tool invocation emitted by the model. */
export interface NormalizedToolCall {
  id: string;
  name: string;
  input: object;
}

export interface AiCompletionRequest {
  /**
   * The concrete model id (e.g. `gemini-2.5-flash`). Feature modules omit this
   * when calling the router — {@link IAiProvider} consumers receive it populated
   * from the resolved AiFeatureConfig / DEFAULT_FYP_CONFIG. Adapters throw if it
   * is missing.
   */
  model?: string;
  systemPrompt?: string;
  messages: AiMessage[];
  /** Budget for the visible ANSWER. Reasoning tokens get their own budget below. */
  maxTokens?: number;
  /**
   * Tokens a reasoning ("thinking") model may spend before answering, granted
   * ON TOP of maxTokens. Without it, thinking models spend the answer's budget
   * on reasoning and return truncated output. Providers without a reasoning
   * mode ignore it.
   */
  reasoningBudgetTokens?: number;
  temperature?: number;
  tools?: NormalizedTool[];
  /** Hint to providers that support prompt caching (Claude/OpenAI). */
  cacheControl?: 'ephemeral' | 'persistent';
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Tokens served from the provider's prompt cache, if reported. */
  cachedTokens?: number;
}

export type AiFinishReason = 'stop' | 'tool_use' | 'length' | 'content_filter';

export interface AiCompletionResult {
  content: string;
  toolCalls?: NormalizedToolCall[];
  finishReason: AiFinishReason;
  usage: AiUsage;
  /** USD cost of this call as priced by {@link priceCall}. */
  actualCost: number;
}

export interface AiStreamChunk {
  delta?: string;
  toolCall?: NormalizedToolCall;
  finishReason?: Exclude<AiFinishReason, 'content_filter'>;
  usage?: AiUsage;
}

export interface AiEmbeddingRequest {
  texts: string[];
  model: string;
}

export interface AiCapabilities {
  /** Vendor supports `tool_use` / function-calling round-trips. */
  tools: boolean;
  /** Vendor supports server-sent streaming. */
  streaming: boolean;
  /** Vendor exposes an embeddings endpoint. */
  embeddings: boolean;
  /** Vendor supports prompt caching for large/static prefixes. */
  promptCaching: boolean;
}

/**
 * The contract every vendor adapter implements. Methods throw
 * {@link AiProviderError} on transport/quota failures so the router can decide
 * whether to fall back; they never silently return partial results.
 */
export interface IAiProvider {
  readonly key: AiProviderKey;
  complete(req: AiCompletionRequest): Promise<AiCompletionResult>;
  stream(req: AiCompletionRequest): AsyncIterable<AiStreamChunk>;
  completeWithTools(req: AiCompletionRequest): Promise<AiCompletionResult>;
  embed(req: AiEmbeddingRequest): Promise<number[][]>;
  capabilities(): AiCapabilities;
  ping(): Promise<{ ok: boolean; latencyMs: number }>;
}

/**
 * Transport/quota error raised by adapters. `retryable` tells the router
 * whether falling back to another provider could succeed (429/5xx/network) vs.
 * a permanent failure (400/auth) that fallback won't fix.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly provider: AiProviderKey,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * The provider has no credentials (no platform API key and no BYO key). Raised
 * before any network call, so a routing fallback to an unconfigured provider is
 * an instant, clearly-labelled skip instead of a doomed request that 401s
 * (BE-026). Not retryable.
 */
export class AiProviderNotConfiguredError extends AiProviderError {
  constructor(provider: AiProviderKey) {
    super(`${provider} is not configured (no API key)`, provider, false);
    this.name = 'AiProviderNotConfiguredError';
  }
}
