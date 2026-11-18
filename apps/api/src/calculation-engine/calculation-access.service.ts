import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import type { KpiScope } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';

/**
 * Who may ask for a KPI to be recomputed or rolled up now.
 *
 * Those two requests work the KPI's value out from other KPIs' values — the
 * children it rolls up, the sources its formula names — store it, and hand it
 * back. The stored value has to be the whole organisation's figure, so the
 * calculation itself is never narrowed to the caller. Instead the request is
 * refused to someone who could not read the values that go into it.
 * (The background worker calls the engine directly and is not checked here.)
 */
@Injectable()
export class CalculationAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
  ) {}

  async assertMayTrigger(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    // Same rule as GET /kpis: a KPI outside the caller's sight does not exist for them.
    if (!(await this.accessContext.isKpiVisible(kpiId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }

    const [children, dependencies] = await Promise.all([
      this.prisma.kPICascade.findMany({
        where: { organizationId: ctx.organizationId, parentKpiId: kpiId },
        select: { childKpi: { select: { scope: true } } },
      }),
      this.prisma.kPIDependency.findMany({
        where: { organizationId: ctx.organizationId, dependentKpiId: kpiId },
        select: { sourceKpiId: true },
      }),
    ]);
    const sources =
      dependencies.length > 0
        ? await this.prisma.kPI.findMany({
            where: { organizationId: ctx.organizationId, id: { in: dependencies.map((d) => d.sourceKpiId) } },
            select: { scope: true },
          })
        : [];

    const scopes = new Set<KpiScope>([...children.map((c) => c.childKpi.scope as KpiScope), ...sources.map((s) => s.scope as KpiScope)]);
    for (const scope of scopes) {
      // `{}` means the caller reads every row of a KPI of this kind.
      if (Object.keys(await this.accessContext.kpiPointScopeWhere(scope)).length > 0) {
        throw new ForbiddenException({
          code: 'FORBIDDEN',
          message: 'This KPI is worked out from values you cannot see. Ask someone who can see them all to recompute it.',
        });
      }
    }
  }
}
