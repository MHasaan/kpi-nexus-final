import { Injectable } from '@nestjs/common';
import { ALL_AI_FEATURES, type AiFeature, type AiProviderKey } from '@kpi-nexus/contracts';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { DEFAULT_FYP_CONFIG, type FeatureRoute } from './default-fyp-config.js';

export interface FeatureConfigView extends FeatureRoute {
  feature: AiFeature;
  isOverride: boolean;
  perFeatureCapUsd?: number;
}

export interface UpsertConfigInput {
  providerId: AiProviderKey;
  model: string;
  fallbackProviderId?: AiProviderKey;
  fallbackModel?: string;
  perFeatureCapUsd?: number;
}

/**
 * Per-feature provider routing config. An org may override the default
 * provider+model+fallback for any AiFeature; unconfigured features resolve to
 * DEFAULT_FYP_CONFIG. `providerId`/`fallbackProviderId` store the AiProviderKey
 * string directly (no FK join needed at FYP scale).
 */
@Injectable()
export class AiConfigsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The route the router should use for a feature (override or default). */
  async resolve(feature: AiFeature): Promise<FeatureRoute> {
    const ctx = RequestContextStore.require();
    const cfg = await this.prisma.aiFeatureConfig.findUnique({
      where: { organizationId_feature: { organizationId: ctx.organizationId, feature } },
    });
    if (!cfg) return DEFAULT_FYP_CONFIG[feature];
    return {
      provider: cfg.providerId as AiProviderKey,
      model: cfg.model,
      fallback: cfg.fallbackProviderId
        ? { provider: cfg.fallbackProviderId as AiProviderKey, model: cfg.fallbackModel ?? cfg.model }
        : DEFAULT_FYP_CONFIG[feature].fallback,
    };
  }

  /** All features with their effective route + whether it's an org override. */
  async list(): Promise<FeatureConfigView[]> {
    const ctx = RequestContextStore.require();
    const overrides = await this.prisma.aiFeatureConfig.findMany({
      where: { organizationId: ctx.organizationId },
    });
    const byFeature = new Map(overrides.map((o) => [o.feature, o]));
    return ALL_AI_FEATURES.map((feature) => {
      const o = byFeature.get(feature);
      if (o) {
        return {
          feature,
          provider: o.providerId as AiProviderKey,
          model: o.model,
          fallback: o.fallbackProviderId
            ? { provider: o.fallbackProviderId as AiProviderKey, model: o.fallbackModel ?? o.model }
            : undefined,
          perFeatureCapUsd: o.perFeatureCapUsd ?? undefined,
          isOverride: true,
        };
      }
      return { feature, ...DEFAULT_FYP_CONFIG[feature], isOverride: false };
    });
  }

  async upsertConfig(feature: AiFeature, input: UpsertConfigInput): Promise<FeatureConfigView> {
    const ctx = RequestContextStore.require();
    await this.prisma.aiFeatureConfig.upsert({
      where: { organizationId_feature: { organizationId: ctx.organizationId, feature } },
      create: {
        organizationId: ctx.organizationId,
        feature,
        providerId: input.providerId,
        model: input.model,
        fallbackProviderId: input.fallbackProviderId ?? null,
        fallbackModel: input.fallbackModel ?? null,
        perFeatureCapUsd: input.perFeatureCapUsd ?? null,
      },
      update: {
        providerId: input.providerId,
        model: input.model,
        fallbackProviderId: input.fallbackProviderId ?? null,
        fallbackModel: input.fallbackModel ?? null,
        perFeatureCapUsd: input.perFeatureCapUsd ?? null,
      },
    });
    return {
      feature,
      provider: input.providerId,
      model: input.model,
      fallback: input.fallbackProviderId
        ? { provider: input.fallbackProviderId, model: input.fallbackModel ?? input.model }
        : undefined,
      perFeatureCapUsd: input.perFeatureCapUsd,
      isOverride: true,
    };
  }

  /** Remove an override, reverting the feature to its default route. */
  async deleteConfig(feature: AiFeature): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.prisma.aiFeatureConfig
      .delete({ where: { organizationId_feature: { organizationId: ctx.organizationId, feature } } })
      .catch(() => undefined);
  }
}
