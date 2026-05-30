import { Injectable } from '@nestjs/common';

import { KpisService } from '../kpis/kpis.service.js';
import { MlClientService } from '../ml/ml-client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

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
  ) {}

  async simulate(
    kpiId: string,
    input: { scenarios: WhatIfScenario[]; baselineCount?: number },
  ): Promise<WhatIfResult> {
    const ctx = RequestContextStore.require();
    await this.kpis.getById(kpiId); // visibility gate

    const take = Math.min(365, Math.max(1, input.baselineCount ?? DEFAULT_BASELINE));
    const points = await this.prisma.kPIDataPoint.findMany({
      where: { organizationId: ctx.organizationId, kpiId },
      orderBy: { recordedAt: 'desc' },
      take,
      select: { value: true },
    });
    const baseline = points.map((p) => p.value).reverse();

    return this.ml.post<WhatIfResult>('/whatif', {
      baseline: { values: baseline },
      scenarios: input.scenarios.map((s) => ({ mechanic: 'additive', ...s })),
    });
  }
}
