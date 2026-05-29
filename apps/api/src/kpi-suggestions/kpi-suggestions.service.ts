import { Injectable } from '@nestjs/common';

import { AiRouterService } from '../ai/ai-router.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type KpiSuggestion, parseKpiSuggestions } from './kpi-suggestion-parser.js';

const SYSTEM_PROMPT = [
  'You are a KPI strategy assistant. Suggest measurable, well-formed KPIs for an organization.',
  'Respond with ONLY a JSON object: {"suggestions": [{name, description, type, direction, scorecardQuadrant, frequency, unit, suggestedTarget, rationale}]}.',
  'type ∈ NUMBER|PERCENTAGE|CURRENCY|DURATION|COUNT|RATING|BOOLEAN.',
  'direction ∈ HIGHER_IS_BETTER|LOWER_IS_BETTER|TARGET_IS_BEST|NEUTRAL.',
  'frequency ∈ DAILY|WEEKLY|BIWEEKLY|MONTHLY|QUARTERLY|YEARLY|CUSTOM|REAL_TIME|AD_HOC.',
  'scorecardQuadrant ∈ FINANCIAL|CUSTOMER|INTERNAL_PROCESS|LEARNING_GROWTH.',
  'Do not suggest KPIs that duplicate the existing ones listed. No prose outside the JSON.',
].join('\n');

/**
 * Generates AI KPI suggestions grounded in the org's profile + existing KPIs.
 * The model's JSON is parsed/validated by {@link parseKpiSuggestions}; an
 * unusable response yields an empty list rather than an error.
 */
@Injectable()
export class KpiSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiRouter: AiRouterService,
  ) {}

  async suggest(input: { count?: number; focus?: string }): Promise<KpiSuggestion[]> {
    const ctx = RequestContextStore.require();
    const count = Math.min(10, Math.max(1, Math.floor(input.count ?? 5)));

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { name: true, industry: true, type: true, sizeTier: true },
    });
    const existing = await this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true },
      take: 200,
    });

    const profile = [
      `Organization: ${org.name}`,
      org.industry ? `Industry: ${org.industry}` : null,
      org.type ? `Type: ${org.type}` : null,
      org.sizeTier ? `Size: ${org.sizeTier}` : null,
      input.focus ? `Focus area: ${input.focus}` : null,
      existing.length ? `Existing KPIs (do not duplicate): ${existing.map((k) => k.name).join(', ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await this.aiRouter.complete('KPI_SUGGESTIONS', {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${profile}\n\nSuggest ${count} new KPIs as JSON.` }],
      maxTokens: 1500,
    });

    return parseKpiSuggestions(result.content, count);
  }
}
