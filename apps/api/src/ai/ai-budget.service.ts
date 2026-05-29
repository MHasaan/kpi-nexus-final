import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { CircuitBreakerMode } from '@kpi-nexus/contracts';
import { Redis } from 'ioredis';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type BudgetDecision, evaluateBudget } from './ai-budget-policy.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export interface SpendSnapshot {
  dailySpend: number;
  monthlySpend: number;
  dailyCapUsd: number;
  monthlyCapUsd: number;
  circuitBreaker: CircuitBreakerMode;
}

/** UTC yyyymmdd / yyyymm window stamps for the rolling Redis counters. */
function dayStamp(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}
function monthStamp(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Per-org AI spend budget. Caps + circuit-breaker mode live in the AiBudget
 * Prisma row (durable); the live rolling spend lives in Redis keyed by UTC
 * day/month so windows self-expire. `evaluate` is the router's pre-flight gate;
 * `debit` is called after a successful paid call. Fails OPEN on a Redis hiccup
 * (treats spend as 0) so a cache outage never hard-blocks the product.
 */
@Injectable()
export class AiBudgetService implements OnModuleDestroy {
  private readonly logger = new Logger(AiBudgetService.name);
  private readonly redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false });

  constructor(private readonly prisma: PrismaService) {}

  private dayKey(orgId: string): string {
    return `ai_budget:${orgId}:daily:${dayStamp(new Date())}`;
  }
  private monthKey(orgId: string): string {
    return `ai_budget:${orgId}:monthly:${monthStamp(new Date())}`;
  }

  /** Load the budget row, lazily creating defaults the first time. */
  private async budgetRow(orgId: string): Promise<{
    dailyCapUsd: number;
    monthlyCapUsd: number;
    circuitBreaker: CircuitBreakerMode;
  }> {
    const existing = await this.prisma.aiBudget.findUnique({ where: { organizationId: orgId } });
    if (existing) {
      return {
        dailyCapUsd: existing.dailyCapUsd,
        monthlyCapUsd: existing.monthlyCapUsd,
        circuitBreaker: existing.circuitBreaker,
      };
    }
    const created = await this.prisma.aiBudget.create({ data: { organizationId: orgId } });
    return {
      dailyCapUsd: created.dailyCapUsd,
      monthlyCapUsd: created.monthlyCapUsd,
      circuitBreaker: created.circuitBreaker,
    };
  }

  private async liveSpend(orgId: string): Promise<{ daily: number; monthly: number }> {
    try {
      const [d, m] = await this.redis.mget(this.dayKey(orgId), this.monthKey(orgId));
      return { daily: Number(d) || 0, monthly: Number(m) || 0 };
    } catch (err) {
      this.logger.warn(`ai-budget liveSpend failed (failing open): ${String(err)}`);
      return { daily: 0, monthly: 0 };
    }
  }

  /** Router pre-flight: decide if a call estimated at `estimatedCost` USD fits. */
  async evaluate(estimatedCost: number): Promise<BudgetDecision> {
    const ctx = RequestContextStore.require();
    const row = await this.budgetRow(ctx.organizationId);
    const spend = await this.liveSpend(ctx.organizationId);
    return evaluateBudget(
      {
        dailySpend: spend.daily,
        monthlySpend: spend.monthly,
        dailyCapUsd: row.dailyCapUsd,
        monthlyCapUsd: row.monthlyCapUsd,
        circuitBreaker: row.circuitBreaker,
      },
      estimatedCost,
    );
  }

  /** Record actual spend after a successful paid call (free calls are no-ops). */
  async debit(cost: number): Promise<void> {
    if (cost <= 0) return;
    const ctx = RequestContextStore.require();
    const dayKey = this.dayKey(ctx.organizationId);
    const monthKey = this.monthKey(ctx.organizationId);
    try {
      const result = await this.redis
        .multi()
        .incrbyfloat(dayKey, cost)
        .expire(dayKey, 60 * 60 * 48) // keep ~2 days so the window survives clock skew
        .incrbyfloat(monthKey, cost)
        .expire(monthKey, 60 * 60 * 24 * 40) // keep ~40 days
        .exec();
      const daily = Number(result?.[0]?.[1] ?? 0);
      const monthly = Number(result?.[2]?.[1] ?? 0);
      await this.prisma.aiBudget
        .update({
          where: { organizationId: ctx.organizationId },
          data: { currentDailySpend: daily, currentMonthlySpend: monthly },
        })
        .catch(() => undefined);
    } catch (err) {
      this.logger.warn(`ai-budget debit failed (non-fatal): ${String(err)}`);
    }
  }

  async getSpendSnapshot(): Promise<SpendSnapshot> {
    const ctx = RequestContextStore.require();
    const row = await this.budgetRow(ctx.organizationId);
    const spend = await this.liveSpend(ctx.organizationId);
    return {
      dailySpend: spend.daily,
      monthlySpend: spend.monthly,
      dailyCapUsd: row.dailyCapUsd,
      monthlyCapUsd: row.monthlyCapUsd,
      circuitBreaker: row.circuitBreaker,
    };
  }

  async updateBudget(input: {
    dailyCapUsd?: number;
    monthlyCapUsd?: number;
    circuitBreaker?: CircuitBreakerMode;
  }): Promise<SpendSnapshot> {
    const ctx = RequestContextStore.require();
    await this.budgetRow(ctx.organizationId); // ensure exists
    await this.prisma.aiBudget.update({
      where: { organizationId: ctx.organizationId },
      data: {
        ...(input.dailyCapUsd !== undefined ? { dailyCapUsd: input.dailyCapUsd } : {}),
        ...(input.monthlyCapUsd !== undefined ? { monthlyCapUsd: input.monthlyCapUsd } : {}),
        ...(input.circuitBreaker !== undefined ? { circuitBreaker: input.circuitBreaker } : {}),
      },
    });
    return this.getSpendSnapshot();
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
