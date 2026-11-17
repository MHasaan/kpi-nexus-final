import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { RouterCallLogEntry } from './ai-router.service.js';

/**
 * Persists every AI provider call to the AiCallLog ledger for cost attribution
 * and audit. Stamps the org from the request context (never trusts a passed-in
 * id) and never throws — a logging failure must not break the AI call itself.
 */
@Injectable()
export class AiCallLogService {
  private readonly logger = new Logger(AiCallLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** What one feature has spent since the start of the current UTC day, in USD. */
  async featureSpendToday(feature: string): Promise<number> {
    const ctx = RequestContextStore.require();
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const sum = await this.prisma.aiCallLog.aggregate({
      where: { organizationId: ctx.organizationId, feature, createdAt: { gte: dayStart } },
      _sum: { costUsd: true },
    });
    return sum._sum.costUsd ?? 0;
  }

  async record(entry: RouterCallLogEntry): Promise<void> {
    try {
      const ctx = RequestContextStore.require();
      await this.prisma.aiCallLog.create({
        data: {
          organizationId: ctx.organizationId,
          feature: entry.feature,
          providerKey: entry.providerKey,
          modelId: entry.modelId,
          inputTokens: entry.inputTokens,
          outputTokens: entry.outputTokens,
          costUsd: entry.costUsd,
          latencyMs: entry.latencyMs,
          status: entry.status,
          errorCode: entry.errorCode ?? null,
          requestId: entry.requestId,
          // context is free-form JSON; cast through unknown to Prisma's JSON input.
          context: (entry.context ?? undefined) as unknown as object | undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`ai-call-log record failed (non-fatal): ${String(err)}`);
    }
  }
}
