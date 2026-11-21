import { HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AiCompletionRequest } from '@kpi-nexus/ai';
import { ALL_PERMISSIONS, type AiFeature } from '@kpi-nexus/contracts';
import type { OnboardingAiMode } from '@kpi-nexus/db';

import { AiProviderRegistry } from '../ai/ai-provider-registry.js';
import { DEFAULT_FYP_CONFIG } from '../ai/default-fyp-config.js';
import { OnboardingService, keepOwnOrganization } from '../onboarding/onboarding.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { budgetsFromEnv } from '../rate-limit/rate-limit-policy.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { limitFor } from './onboarding-ai-limits.js';
import { parseGeneratedOrg } from './parse-generated-org.js';

const FEATURE: Record<OnboardingAiMode, AiFeature> = {
  generator: 'ONBOARDING_GENERATOR',
  assistant: 'ONBOARDING_ASSISTANT',
  suggest: 'ONBOARDING_SUGGEST',
  explain: 'ONBOARDING_EXPLAIN',
};

// Roles may only hold these keys; anything else grants nothing.
const PERMISSIONS_RULE = `Role permissions ⊆ ${ALL_PERMISSIONS.join('|')}. The admin role gets all of them.`;

/**
 * The draft's sections, their fields and the values each may take: the generator writes a whole draft by them
 * and the assistant changes one by them, so what either proposes can be applied as it is.
 */
const FIELD_RULES = [
  '{"organization":{"name","industry","type","sizeTier","timezone","currency","locale","fiscalYearStartMonth","weekStartsOn"},"roles":[{"name","isAdmin","level","permissions":[]}],',
  '"positions":[{"name","track"}],"orgUnitTypes":[{"name","dimension"}],"orgUnits":[{"name","type","parent"}],',
  '"kpiCategories":[{"name"}],"kpis":[{"name","category","scope","type","direction","frequency","unit","scorecardQuadrant"}]}.',
  'sizeTier ∈ SMALL|MEDIUM|LARGE|ENTERPRISE (about 1-50, 51-250, 251-1000, more people).',
  'Fill timezone (IANA, e.g. Asia/Karachi), currency (ISO 4217, e.g. PKR), locale (BCP 47, e.g. en-PK), fiscalYearStartMonth (1-12) and weekStartsOn (0 = Sunday … 6 = Saturday) only when the description says or clearly implies them (a city or country, a currency); otherwise leave them out.',
  'track ∈ INDIVIDUAL_CONTRIBUTOR|MANAGEMENT|EXECUTIVE. scope ∈ ORG_WIDE|PER_UNIT|PER_USER.',
  'type ∈ NUMBER|PERCENTAGE|CURRENCY|DURATION|COUNT|RATING|BOOLEAN. direction ∈ HIGHER_IS_BETTER|LOWER_IS_BETTER|TARGET_IS_BEST|NEUTRAL.',
  'frequency ∈ DAILY|WEEKLY|MONTHLY|QUARTERLY|YEARLY. scorecardQuadrant ∈ FINANCIAL|CUSTOMER|INTERNAL_PROCESS|LEARNING_GROWTH.',
  'Every orgUnit.type must match an orgUnitTypes.name; every kpi.category must match a kpiCategories.name. Exactly one role with isAdmin=true.',
  PERMISSIONS_RULE,
];

const GEN_SYSTEM = [
  'You are an onboarding assistant. Generate a complete organization setup as JSON ONLY (no prose, no fences):',
  ...FIELD_RULES,
].join('\n');

const ASSISTANT_SYSTEM = [
  'You are an onboarding assistant. Given the current draft and an instruction, respond with ONLY a JSON array of RFC 6902 operations. No prose.',
  'Add to a section with its "/-" path (e.g. {"op":"add","path":"/kpis/-","value":{...}}); replace or remove only what the instruction names, never a whole section.',
  'Use exactly these sections, fields and values:',
  ...FIELD_RULES,
  'A new KPI\'s category must be one of the draft\'s kpiCategories; if none fits, add the category first. Say a KPI is recorded per unit or per person with its scope.',
].join('\n');

/**
 * Onboarding AI co-pilot. Runs PRE-ORG (no tenant context), so it calls the
 * provider registry directly with manual primary→fallback rather than through
 * the org-scoped AiRouter (budget/call-log are org-scoped and don't apply yet).
 * Anonymous spend is bounded three ways (BE-010): a per-IP hourly throttle
 * (RateLimitGuard), per-mode hourly limits per session, and a global daily
 * cap charged here once per real LLM call, after the draft token checks out.
 */
@Injectable()
export class OnboardingAiService {
  private readonly logger = new Logger(OnboardingAiService.name);
  private readonly globalPerDay = budgetsFromEnv().onboardingAiGlobalPerDay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: AiProviderRegistry,
    private readonly rateLimit: RateLimitService,
    private readonly onboarding: OnboardingService,
  ) {}

  private async enforceLimit(sessionId: string, mode: OnboardingAiMode): Promise<void> {
    const { limit, windowSec } = limitFor(mode);
    const result = await this.rateLimit.consume(`onboarding-ai:${sessionId}:${mode}`, limit, windowSec, Date.now());
    if (!result.allowed) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: `Too many ${mode} requests; try again later`, details: { retryAfter: windowSec } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Shared daily cap across ALL anonymous onboarding sessions (BE-010). */
  private async enforceGlobalBudget(): Promise<void> {
    const windowSec = 86_400;
    const result = await this.rateLimit.consume('rl:onboarding-ai:global', this.globalPerDay, windowSec, Date.now());
    if (!result.allowed) {
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Onboarding AI is temporarily at capacity; try again later', details: { retryAfter: windowSec } },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** Direct provider call with primary→fallback (no org-scoped budget/log). */
  private async callAi(feature: AiFeature, request: AiCompletionRequest) {
    const route = DEFAULT_FYP_CONFIG[feature];
    const candidates = [{ provider: route.provider, model: route.model }, ...(route.fallback ? [route.fallback] : [])];
    let lastError: unknown;
    for (const c of candidates) {
      try {
        const provider = await this.registry.getProvider(c.provider);
        // Thinking models count reasoning against maxTokens; without the route's
        // budget they spent the answer on thinking and returned cut-off JSON.
        const result = await provider.complete({
          ...request,
          model: c.model,
          ...(route.reasoningBudgetTokens ? { reasoningBudgetTokens: route.reasoningBudgetTokens } : {}),
        });
        return { content: result.content, usage: result.usage, actualCost: result.actualCost, provider: c.provider, model: c.model };
      } catch (err) {
        lastError = err;
      }
    }
    // Public (anonymous) endpoint: the provider's error text (which can echo
    // credential problems) goes to the server log, never the response.
    this.logger.warn(`Onboarding AI (${feature}) — all providers failed: ${String(lastError)}`);
    throw new ServiceUnavailableException({ code: 'AI_UNAVAILABLE', message: 'AI providers unavailable' });
  }

  private async run(sessionId: string, token: string, mode: OnboardingAiMode, prompt: string, systemPrompt: string) {
    await this.onboarding.getDraft(sessionId, token); // verify the draft token first
    await this.enforceLimit(sessionId, mode); // then consume the per-mode limit
    await this.enforceGlobalBudget(); // and only then the shared daily cap

    const started = Date.now();
    const result = await this.callAi(FEATURE[mode], {
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: mode === 'generator' ? 8000 : 800,
    });

    const interaction = await RequestContextStore.runWithBypass('onboarding-ai.log', () =>
      this.prisma.onboardingAIInteraction.create({
        data: {
          sessionId,
          mode,
          prompt,
          response: result.content,
          appliedSections: [],
          editedSections: [],
          rejectedSections: [],
          promptTokens: result.usage.inputTokens,
          completionTokens: result.usage.outputTokens,
          latencyMs: Date.now() - started,
          providerKey: result.provider,
          modelId: result.model,
          costUsd: result.actualCost,
        },
        select: { id: true },
      }),
    );
    return { interactionId: interaction.id, content: result.content };
  }

  async generate(sessionId: string, token: string, prompt: string) {
    const { interactionId, content } = await this.run(sessionId, token, 'generator', prompt, GEN_SYSTEM);
    const preview = parseGeneratedOrg(content);
    return {
      interactionId,
      mode: 'generator' as const,
      preview,
      counts: {
        roles: preview.roles.length,
        positions: preview.positions.length,
        orgUnitTypes: preview.orgUnitTypes.length,
        orgUnits: preview.orgUnits.length,
        kpiCategories: preview.kpiCategories.length,
        kpis: preview.kpis.length,
      },
    };
  }

  async assistant(sessionId: string, token: string, instruction: string) {
    const draft = await this.onboarding.getDraft(sessionId, token);
    const sys = ASSISTANT_SYSTEM;
    const { interactionId, content } = await this.run(
      sessionId,
      token,
      'assistant',
      `Current draft:\n${JSON.stringify(draft.payload)}\n\nInstruction: ${instruction}`,
      sys,
    );
    let patch: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      if (Array.isArray(parsed)) patch = parsed;
    } catch {
      patch = [];
    }
    return { interactionId, mode: 'assistant' as const, patch };
  }

  async suggest(sessionId: string, token: string, fieldPath: string, context?: string) {
    const sys = 'You are an onboarding assistant. Suggest 3-6 concise values for the given field. Respond with ONLY a JSON array of strings.';
    const { interactionId, content } = await this.run(
      sessionId,
      token,
      'suggest',
      `Field: ${fieldPath}${context ? `\nContext: ${context}` : ''}`,
      sys,
    );
    let suggestions: string[] = [];
    try {
      const parsed: unknown = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
      if (Array.isArray(parsed)) suggestions = parsed.filter((s): s is string => typeof s === 'string');
    } catch {
      suggestions = [];
    }
    return { interactionId, mode: 'suggest' as const, suggestions };
  }

  async explain(sessionId: string, token: string, fieldPath: string) {
    const sys = 'You are an onboarding assistant. Explain what this field means and one best practice, in 2-3 sentences. Plain prose.';
    const { interactionId, content } = await this.run(sessionId, token, 'explain', `Field: ${fieldPath}`, sys);
    return { interactionId, mode: 'explain' as const, explanation: content };
  }

  /** Record the user's selective adoption + merge applied sections into the draft. */
  async apply(
    sessionId: string,
    token: string,
    input: { interactionId: string; appliedSections: string[]; editedSections?: string[]; rejectedSections?: string[] },
  ) {
    const draft = await this.onboarding.getDraft(sessionId, token); // also verifies the token
    const interaction = await RequestContextStore.runWithBypass('onboarding-ai.apply.load', () =>
      this.prisma.onboardingAIInteraction.findFirst({ where: { id: input.interactionId, sessionId } }),
    );
    if (!interaction) throw new NotFoundException({ code: 'INTERACTION_NOT_FOUND', message: 'Interaction not found' });

    const generated = parseGeneratedOrg(interaction.response);
    const patch: Record<string, unknown> = {};
    for (const section of input.appliedSections) {
      if (section in generated) patch[section] = (generated as Record<string, unknown>)[section];
    }
    // A generated organisation is a guess at industry, type and size. It fills in
    // what the person has not said; it never renames their organisation.
    if (patch.organization) {
      patch.organization = keepOwnOrganization(
        (draft.payload as { organization?: Record<string, unknown> } | null)?.organization,
        patch.organization as Record<string, unknown>,
      );
    }

    await RequestContextStore.runWithBypass('onboarding-ai.apply.update', () =>
      this.prisma.onboardingAIInteraction.update({
        where: { id: input.interactionId },
        data: {
          appliedSections: input.appliedSections,
          editedSections: input.editedSections ?? [],
          rejectedSections: input.rejectedSections ?? [],
        },
      }),
    );

    if (Object.keys(patch).length > 0) {
      await this.onboarding.patchDraft(sessionId, token, patch, 'ai-apply');
    }
    return { applied: Object.keys(patch) };
  }
}
