import { Injectable } from '@nestjs/common';
import type { Forecast, ForecastModelKind } from '@kpi-nexus/db';

import { KpisService } from '../kpis/kpis.service.js';
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
 * The persisted `model` reflects what the sidecar actually used (currently NAIVE
 * — prophet/arima are deferred), not necessarily what was requested.
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
    await this.kpis.getById(kpiId); // visibility gate

    // Layer-4: clamp the user-facing read window to the principal's historyWindowDays
    // (null ⇒ parity / admin). Fixed WINDOW read with no request `from`.
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
    if (points.length === 0) throw new InsufficientDataError('forecast');
    const ordered = points.reverse();

    const result = await this.ml.post<MlForecast>('/forecast', {
      values: ordered.map((p) => p.value),
      timestamps: ordered.map((p) => p.recordedAt.toISOString()),
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
    await this.kpis.getById(kpiId); // visibility gate
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
