import { randomUUID } from 'node:crypto';

import {
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiEmbeddingRequest,
  AiProviderError,
  type IAiProvider,
  priceCall,
} from '@kpi-nexus/ai';
import type { AiCallStatus, AiFeature, AiProviderKey } from '@kpi-nexus/contracts';

import { AiBudgetExceededError, AiProviderUnavailableError } from './ai-errors.js';
import type { BudgetDecision } from './ai-budget-policy.js';
import type { FeatureRoute } from './default-fyp-config.js';

/** What the router writes to the call-log sink (org id is stamped by the sink). */
export interface RouterCallLogEntry {
  feature: AiFeature;
  providerKey: AiProviderKey;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: AiCallStatus;
  errorCode?: string;
  requestId: string;
  context?: Record<string, unknown>;
}

/**
 * Collaborators the router needs. Modelled as an interface so the fallback logic
 * is unit-testable with fakes; the Nest module wires the concrete services
 * (registry / budget / call-log / per-feature config) into this shape.
 */
export interface RouterDeps {
  registry: { getProvider(key: AiProviderKey): IAiProvider | Promise<IAiProvider> };
  budget: {
    evaluate(estimatedCost: number): Promise<BudgetDecision> | BudgetDecision;
    debit(cost: number): Promise<void> | void;
  };
  callLog: { record(entry: RouterCallLogEntry): Promise<void> | void };
  resolveConfig(feature: AiFeature): Promise<FeatureRoute> | FeatureRoute;
}

const now = (): number => {
  try {
    return Date.now();
  } catch {
    return 0;
  }
};

const estimateInputTokens = (req: AiCompletionRequest): number => {
  const chars = (req.systemPrompt ?? '').length + req.messages.reduce((n, m) => n + m.content.length, 0);
  return Math.ceil(chars / 4);
};

/**
 * Routes an AI feature to its configured provider, debits the budget, logs the
 * call, and falls back to the secondary provider on transient failures or (in
 * FALLBACK circuit-breaker mode) on budget exhaustion. In FAIL_CLOSED mode a
 * budget block is terminal — it throws 402 without touching a provider.
 */
export class AiRouterService {
  constructor(private readonly deps: RouterDeps) {}

  async complete(feature: AiFeature, request: AiCompletionRequest): Promise<AiCompletionResult> {
    const config = await this.deps.resolveConfig(feature);
    const candidates: Array<{ provider: AiProviderKey; model: string }> = [
      { provider: config.provider, model: config.model },
      ...(config.fallback ? [config.fallback] : []),
    ];

    const attempted: Array<{ provider: AiProviderKey; error: string }> = [];
    let budgetReason: 'DAILY_CAP' | 'MONTHLY_CAP' | undefined;

    for (const candidate of candidates) {
      const estimated = priceCall(candidate.model, {
        inputTokens: estimateInputTokens(request),
        outputTokens: request.maxTokens ?? 1024,
      });
      const decision = await this.deps.budget.evaluate(estimated);
      if (!decision.allowed) {
        if (decision.mode === 'FAIL_CLOSED') {
          throw new AiBudgetExceededError(decision.reason ?? 'DAILY_CAP');
        }
        // FALLBACK mode: skip this candidate, try the next (typically free) one.
        budgetReason = decision.reason;
        attempted.push({ provider: candidate.provider, error: `budget:${decision.reason}` });
        await this.deps.callLog.record(this.suppressedEntry(feature, candidate));
        continue;
      }

      const requestId = randomUUID();
      const started = now();
      try {
        const provider = await this.deps.registry.getProvider(candidate.provider);
        const req: AiCompletionRequest = { ...request, model: candidate.model };
        const result = await (request.tools?.length
          ? provider.completeWithTools(req)
          : provider.complete(req));
        await this.deps.budget.debit(result.actualCost);
        await this.deps.callLog.record({
          feature,
          providerKey: candidate.provider,
          modelId: candidate.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costUsd: result.actualCost,
          latencyMs: now() - started,
          status: 'SUCCESS',
          requestId,
        });
        return result;
      } catch (err) {
        const code = err instanceof AiProviderError ? String(err.statusCode ?? 'ERR') : 'ERR';
        attempted.push({ provider: candidate.provider, error: err instanceof Error ? err.message : String(err) });
        await this.deps.callLog.record({
          feature,
          providerKey: candidate.provider,
          modelId: candidate.model,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: now() - started,
          status: 'FAILED',
          errorCode: code,
          requestId,
        });
      }
    }

    // Every candidate was budget-suppressed (and none errored) → surface as 402.
    if (budgetReason && attempted.every((a) => a.error.startsWith('budget:'))) {
      throw new AiBudgetExceededError(budgetReason);
    }
    throw new AiProviderUnavailableError(attempted);
  }

  completeWithTools(feature: AiFeature, request: AiCompletionRequest): Promise<AiCompletionResult> {
    return this.complete(feature, { ...request, tools: request.tools ?? [] });
  }

  async embed(feature: AiFeature, request: AiEmbeddingRequest): Promise<number[][]> {
    const config = await this.deps.resolveConfig(feature);
    const candidates: Array<{ provider: AiProviderKey; model: string }> = [
      { provider: config.provider, model: config.model },
      ...(config.fallback ? [config.fallback] : []),
    ];
    const attempted: Array<{ provider: AiProviderKey; error: string }> = [];
    for (const candidate of candidates) {
      try {
        const provider = await this.deps.registry.getProvider(candidate.provider);
        return await provider.embed({ ...request, model: candidate.model });
      } catch (err) {
        attempted.push({ provider: candidate.provider, error: err instanceof Error ? err.message : String(err) });
      }
    }
    throw new AiProviderUnavailableError(attempted);
  }

  private suppressedEntry(feature: AiFeature, candidate: { provider: AiProviderKey; model: string }): RouterCallLogEntry {
    return {
      feature,
      providerKey: candidate.provider,
      modelId: candidate.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
      status: 'SUPPRESSED',
      requestId: randomUUID(),
    };
  }
}
