import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { checkQuota, resolveLimit } from './quota-check.js';

interface BuiltinPlan {
  key: string;
  displayName: string;
  monthlyPriceUsd: number;
  features: string[];
  quotas: Record<string, number>;
}

// Builtin plan catalog (global, seeded lazily). quota 0 = unlimited.
const BUILTIN_PLANS: BuiltinPlan[] = [
  { key: 'FREE', displayName: 'Free', monthlyPriceUsd: 0, features: [], quotas: { kpis: 10, dashboards: 2 } },
  {
    key: 'PRO', displayName: 'Pro', monthlyPriceUsd: 49,
    features: ['ai_insights', 'webhooks', 'scheduled_reports'],
    quotas: { kpis: 200, dashboards: 50 },
  },
  {
    key: 'ENTERPRISE', displayName: 'Enterprise', monthlyPriceUsd: 0,
    features: ['ai_insights', 'webhooks', 'scheduled_reports', 'sso', 'custom_domain', 'api_keys'],
    quotas: { kpis: 0, dashboards: 0 },
  },
];

export interface BillingStatus {
  planKey: string;
  displayName: string;
  features: string[];
  quotas: Array<{ key: string; limit: number; current: number }>;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotently seed the global plan catalog. */
  async seedIfEmpty(): Promise<void> {
    const count = await this.prisma.plan.count();
    if (count > 0) return;
    await this.prisma.plan.createMany({
      data: BUILTIN_PLANS.map((p, i) => ({
        key: p.key,
        displayName: p.displayName,
        monthlyPriceUsd: p.monthlyPriceUsd,
        features: p.features,
        quotas: p.quotas,
        sortOrder: i,
      })),
      skipDuplicates: true,
    });
  }

  private async planForOrg(): Promise<BuiltinPlan> {
    await this.seedIfEmpty();
    const ctx = RequestContextStore.require();
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
      select: { planKey: true },
    });
    const plan = await this.prisma.plan.findUnique({ where: { key: org.planKey } });
    if (plan) {
      return {
        key: plan.key,
        displayName: plan.displayName,
        monthlyPriceUsd: plan.monthlyPriceUsd,
        features: plan.features,
        quotas: (plan.quotas as Record<string, number>) ?? {},
      };
    }
    // Unknown planKey → treat as unlimited enterprise.
    return BUILTIN_PLANS[2]!;
  }

  /** Live/recorded current usage for a quota key. */
  private async currentUsage(key: string): Promise<number> {
    const ctx = RequestContextStore.require();
    if (key === 'kpis') {
      return this.prisma.kPI.count({ where: { organizationId: ctx.organizationId, deletedAt: null } });
    }
    if (key === 'dashboards') {
      return this.prisma.dashboard.count({ where: { organizationId: ctx.organizationId, deletedAt: null } });
    }
    const row = await this.prisma.tenantQuota.findUnique({
      where: { organizationId_key: { organizationId: ctx.organizationId, key } },
      select: { current: true },
    });
    return row?.current ?? 0;
  }

  /** Throws 402 PAYMENT_REQUIRED when adding `increment` would exceed the plan quota for `key`. */
  async assertWithinQuota(key: string, increment = 1): Promise<void> {
    const plan = await this.planForOrg();
    const limit = resolveLimit(plan.quotas, key);
    if (limit <= 0) return; // unlimited
    const current = await this.currentUsage(key);
    if (!checkQuota(limit, current, increment)) {
      throw new HttpException(
        {
          code: 'QUOTA_EXCEEDED',
          message: `Plan '${plan.key}' allows ${limit} ${key}; you are at ${current}. Upgrade to add more.`,
          details: { key, limit, current },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /** Whether the org's plan (or an explicit feature flag) enables a feature. */
  async hasFeature(key: string): Promise<boolean> {
    const ctx = RequestContextStore.require();
    const flag = await this.prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId: ctx.organizationId, key } },
      select: { enabled: true },
    });
    if (flag?.enabled) return true;
    const plan = await this.planForOrg();
    return plan.features.includes(key);
  }

  async getStatus(): Promise<BillingStatus> {
    const plan = await this.planForOrg();
    const quotas = await Promise.all(
      Object.keys(plan.quotas).map(async (key) => ({
        key,
        limit: resolveLimit(plan.quotas, key),
        current: await this.currentUsage(key),
      })),
    );
    return { planKey: plan.key, displayName: plan.displayName, features: plan.features, quotas };
  }

  async setPlan(planKey: string): Promise<BillingStatus> {
    await this.seedIfEmpty();
    const ctx = RequestContextStore.require();
    const plan = await this.prisma.plan.findUnique({ where: { key: planKey }, select: { key: true } });
    if (!plan) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `Unknown plan '${planKey}'` });
    await this.prisma.organization.update({ where: { id: ctx.organizationId }, data: { planKey } });
    return this.getStatus();
  }
}
