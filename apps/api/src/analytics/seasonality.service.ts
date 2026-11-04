import { Injectable } from '@nestjs/common';

import { KpisService } from '../kpis/kpis.service.js';
import { requireAnalyticsKpi } from './analytics-scope.js';
import { MlClientService } from '../ml/ml-client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { clampHistoryFrom } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const WINDOW = 365;

export interface SeasonalityResult {
  trend: Array<number | null>;
  seasonal: Array<number | null>;
  resid: Array<number | null>;
  period: number;
  model: string;
}

export interface SeasonalityOpts {
  period?: number;
  model?: string;
}

/**
 * Seasonal decomposition for a KPI's series via the ML sidecar (statsmodels).
 * Visibility is enforced via KpisService.getById. Stateless — not persisted.
 */
@Injectable()
export class SeasonalityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClientService,
    private readonly kpis: KpisService,
    private readonly accessContext: AccessContextService,
  ) {}

  async decompose(kpiId: string, opts: SeasonalityOpts): Promise<SeasonalityResult> {
    const ctx = RequestContextStore.require();
    await requireAnalyticsKpi(this.kpis, this.accessContext, kpiId); // KPI visibility + ANALYTICS scope (BE-004)

    // Layer-4: clamp the user-facing decompose read to historyWindowDays (null ⇒ parity).
    const limits = await this.accessContext.dataLimits();
    const from = clampHistoryFrom(undefined, limits.historyWindowDays);
    const where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } } = {
      organizationId: ctx.organizationId,
      kpiId,
    };
    if (from) where.recordedAt = { gte: from };

    const points = await this.prisma.kPIDataPoint.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take: WINDOW,
      select: { value: true, recordedAt: true },
    });
    const series = points.map((p) => p.value).reverse(); // chronological order

    const payload: Record<string, unknown> = {
      series,
      model: opts.model ?? 'additive',
    };
    // Only include period in the payload when the caller supplies it explicitly;
    // otherwise the ML sidecar infers it from the series length.
    if (opts.period !== undefined) {
      payload['period'] = opts.period;
    }

    return this.ml.post<SeasonalityResult>('/seasonality', payload);
  }
}
