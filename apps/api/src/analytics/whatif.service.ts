import { Injectable } from '@nestjs/common';

import { KpisService } from '../kpis/kpis.service.js';
import { requireAnalyticsKpi } from './analytics-scope.js';
import { MlClientService } from '../ml/ml-client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { clampHistoryFrom } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { InsufficientDataError } from './insufficient-data.error.js';

const DEFAULT_BASELINE = 12;

export interface WhatIfScenario {
  deltaPct?: number;
  deltaAbsolute?: number;
  mechanic?: 'additive' | 'multiplicative';
  floor?: number;
  ceiling?: number;
}

export interface WhatIfResult {
  baseline: number[];
  scenarios: Array<{ values: number[]; aggregateLift: number; aggregateLiftPct: number }>;
}

/**
 * What-if scenario simulation via the ML sidecar. Stateless (not persisted).
 * Visibility enforced via KpisService.getById before the KPI's baseline series
 * is read.
 */
@Injectable()
export class WhatIfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClientService,
    private readonly kpis: KpisService,
    private readonly accessContext: AccessContextService,
  ) {}

  async simulate(
    kpiId: string,
    input: { scenarios: WhatIfScenario[]; baselineCount?: number },
  ): Promise<WhatIfResult> {
    const ctx = RequestContextStore.require();
    await requireAnalyticsKpi(this.kpis, this.accessContext, kpiId); // KPI visibility + ANALYTICS scope (BE-004)

    // Layer-4: clamp the user-facing baseline read to historyWindowDays (null ⇒ parity).
    const limits = await this.accessContext.dataLimits();
    const from = clampHistoryFrom(undefined, limits.historyWindowDays);
    const take = Math.min(365, Math.max(1, input.baselineCount ?? DEFAULT_BASELINE));
    const where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } } = {
      organizationId: ctx.organizationId,
      kpiId,
    };
    if (from) where.recordedAt = { gte: from };
    const points = await this.prisma.kPIDataPoint.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      take,
      select: { value: true },
    });
    if (points.length === 0) throw new InsufficientDataError('simulate');
    const baseline = points.map((p) => p.value).reverse();

    return this.ml.post<WhatIfResult>('/whatif', {
      baseline: { values: baseline },
      scenarios: input.scenarios.map((s) => ({ mechanic: 'additive', ...s })),
    });
  }
}
