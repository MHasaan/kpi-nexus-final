import { Injectable } from '@nestjs/common';
import type { Forecast, ForecastModelKind } from '@kpi-nexus/db';

import { KpisService } from '../kpis/kpis.service.js';
import { requireAnalyticsKpi } from './analytics-scope.js';
import { MlClientService } from '../ml/ml-client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { clampHistoryFrom } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { InsufficientDataError } from './insufficient-data.error.js';

const WINDOW = 365;

interface MlForecast {
  predictions: Array<Record<string, number | string>>;
  fitMetrics?: Record<string, number>;
  model: string;
}

/** Map the sidecar's model string to the ForecastModelKind enum. */
function toModelKind(model: string): ForecastModelKind {
  const up = model.toUpperCase();
  return (['PROPHET', 'ARIMA', 'NAIVE', 'LSTM'] as const).includes(up as ForecastModelKind)
    ? (up as ForecastModelKind)
    : 'NAIVE';
}

/**
 * KPI forecasting via the ML sidecar. Visibility enforced via KpisService.getById.
 * The persisted `model` reflects what the sidecar actually used: it runs NAIVE
 * instead of PROPHET/ARIMA when the history is too short, not necessarily what
 * was requested (OT-005).
 */
@Injectable()
export class ForecastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClientService,
    private readonly kpis: KpisService,
    private readonly accessContext: AccessContextService,
  ) {}

  async forecast(kpiId: string, opts: { horizon: number; model?: string }): Promise<Forecast> {
    const ctx = RequestContextStore.require();
    await requireAnalyticsKpi(this.kpis, this.accessContext, kpiId); // KPI visibility + ANALYTICS scope (BE-004)

    // Layer-4: clamp the user-facing read window to the principal's historyWindowDays
    // (null ⇒ parity / admin). Fixed WINDOW read with no request `from`.
    const limits = await this.accessContext.dataLimits();
    const from = clampHistoryFrom(undefined, limits.historyWindowDays);
    const where: { organizationId: string; kpiId: string; recordedAt?: { gte: Date } } = {
      organizationId: ctx.organizationId,
      kpiId,
    };
    if (from) where.recordedAt = { gte: from };

    // A forecast runs over the periods the values describe, not when they were
    // entered: a backfill of 24 months is typed in seconds (OT-005).
    const points = await this.prisma.kPIDataPoint.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      take: WINDOW,
      select: { value: true, periodStart: true },
    });
    if (points.length === 0) throw new InsufficientDataError('forecast');
    const ordered = points.reverse();

    const result = await this.ml.post<MlForecast>('/forecast', {
      values: ordered.map((p) => p.value),
      timestamps: ordered.map((p) => p.periodStart.toISOString()),
      horizon: opts.horizon,
      model: opts.model ?? 'naive',
    });

    return this.prisma.forecast.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        horizon: opts.horizon,
        model: toModelKind(result.model),
        predictions: result.predictions as unknown as object,
        fitMetrics: (result.fitMetrics ?? undefined) as unknown as object | undefined,
      },
    });
  }

  async list(kpiId: string, model?: string): Promise<Forecast[]> {
    const ctx = RequestContextStore.require();
    await requireAnalyticsKpi(this.kpis, this.accessContext, kpiId); // KPI visibility + ANALYTICS scope (BE-004)
    return this.prisma.forecast.findMany({
      where: {
        organizationId: ctx.organizationId,
        kpiId,
        ...(model ? { model: toModelKind(model) } : {}),
      },
      orderBy: { generatedAt: 'desc' },
      take: 50,
    });
  }
}
