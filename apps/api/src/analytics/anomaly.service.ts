import { Injectable, NotFoundException } from '@nestjs/common';
import type { AnomalyDetection } from '@kpi-nexus/db';

import { KpisService } from '../kpis/kpis.service.js';
import { MlClientService } from '../ml/ml-client.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RecommendationsService } from '../recommendations/recommendations.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

export interface MlAnomaly {
  index: number;
  score: number;
  methodHits?: Record<string, number>;
}

export interface DetectedAnomaly extends MlAnomaly {
  dataPointId: string | null;
  id?: string;
}

export interface AnomalyDetectResult {
  anomalies: DetectedAnomaly[];
}

const WINDOW = 365;

/**
 * Anomaly detection over a KPI's series via the ML sidecar. Visibility is
 * enforced by delegating to KpisService.getById (throws 404 if the caller
 * can't see the KPI) before any data is read or sent to the sidecar.
 */
@Injectable()
export class AnomalyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClientService,
    private readonly kpis: KpisService,
    private readonly recommendations: RecommendationsService,
  ) {}

  /** Recent points oldest→newest (visibility already enforced by caller). */
  private async series(organizationId: string, kpiId: string) {
    const rows = await this.prisma.kPIDataPoint.findMany({
      where: { organizationId, kpiId },
      orderBy: { recordedAt: 'desc' },
      take: WINDOW,
      select: { id: true, value: true, recordedAt: true },
    });
    return rows.reverse();
  }

  async detect(
    kpiId: string,
    opts: { method?: string; threshold?: number; persist?: boolean } = {},
  ): Promise<AnomalyDetectResult> {
    const ctx = RequestContextStore.require();
    await this.kpis.getById(kpiId); // visibility gate (throws 404 if not visible)

    const points = await this.series(ctx.organizationId, kpiId);
    if (points.length < 2) return { anomalies: [] };

    const result = await this.ml.post<{ anomalies: MlAnomaly[] }>('/anomaly/detect', {
      values: points.map((p) => p.value),
      timestamps: points.map((p) => p.recordedAt.toISOString()),
      method: opts.method ?? 'ensemble',
      threshold: opts.threshold ?? 3.0,
    });

    const enriched = result.anomalies.map((a) => ({
      ...a,
      dataPointId: points[a.index]?.id ?? null,
    }));

    if (opts.persist) {
      const created = await Promise.all(
        enriched.map((a) =>
          this.prisma.anomalyDetection.create({
            data: {
              organizationId: ctx.organizationId,
              kpiId,
              dataPointId: a.dataPointId,
              score: a.score,
              method: (opts.method ?? 'ensemble').toUpperCase(),
            },
            select: { id: true, dataPointId: true, score: true },
          }),
        ),
      );
      return {
        anomalies: enriched.map((a, i) => ({ ...a, id: created[i]?.id })),
      };
    }
    return { anomalies: enriched };
  }

  async list(
    kpiId: string,
    filter: { from?: Date; to?: Date; isConfirmed?: boolean },
  ): Promise<AnomalyDetection[]> {
    const ctx = RequestContextStore.require();
    await this.kpis.getById(kpiId); // visibility gate
    return this.prisma.anomalyDetection.findMany({
      where: {
        organizationId: ctx.organizationId,
        kpiId,
        ...(filter.isConfirmed !== undefined ? { isConfirmed: filter.isConfirmed } : {}),
        ...(filter.from || filter.to
          ? { detectedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
          : {}),
      },
      orderBy: { detectedAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Confirm an anomaly. On the false→true transition: raise a synthetic
   * HIGH-severity alert (no rule) and fire-and-forget an AI recommendation.
   */
  async confirm(kpiId: string, anomalyId: string): Promise<AnomalyDetection> {
    const ctx = RequestContextStore.require();
    await this.kpis.getById(kpiId); // visibility gate

    const existing = await this.prisma.anomalyDetection.findFirst({
      where: { id: anomalyId, organizationId: ctx.organizationId, kpiId },
    });
    if (!existing) throw new NotFoundException({ code: 'ANOMALY_NOT_FOUND', message: 'Anomaly not found' });

    const updated = await this.prisma.anomalyDetection.update({
      where: { id: anomalyId },
      data: { isConfirmed: true },
    });

    if (!existing.isConfirmed) {
      // Synthetic alert (alertRuleId null) so the in-app inbox surfaces it.
      await this.prisma.alert
        .create({
          data: {
            organizationId: ctx.organizationId,
            kpiId,
            message: `Confirmed anomaly (score ${existing.score.toFixed(2)}, ${existing.method})`,
            severity: 'HIGH',
          },
        })
        .catch(() => undefined);
      // AI recommendation (never throws — won't block confirm).
      await this.recommendations.generateInOrg({ kpiId, anomalyId });
    }
    return updated;
  }
}
