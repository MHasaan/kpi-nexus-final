import { NotFoundException } from '@nestjs/common';

import type { KpisService } from '../kpis/kpis.service.js';
import type { AccessContextService } from '../rbac/services/access-context.service.js';
import type { KpiScope } from '../rbac/visibility/kpi-visibility.js';

/**
 * Gate for every per-KPI analytics call (forecast, what-if, anomalies,
 * seasonality): the KPI must be visible (KPIS scope + category allowlist, via
 * KpisService.getById) AND inside the ANALYTICS scope ceiling (BE-004). Both
 * failures are a 404, so a KPI outside either scope looks absent. Returns the
 * KPI so callers can scope its data points (analyticsPointScopeWhere).
 */
export async function requireAnalyticsKpi(
  kpis: Pick<KpisService, 'getById'>,
  accessContext: Pick<AccessContextService, 'isKpiAnalyticsAllowed'>,
  kpiId: string,
): Promise<{ scope: KpiScope }> {
  const kpi = await kpis.getById(kpiId);
  if (!(await accessContext.isKpiAnalyticsAllowed(kpiId))) {
    throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
  }
  return kpi;
}
