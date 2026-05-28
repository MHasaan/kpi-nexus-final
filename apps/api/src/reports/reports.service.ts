import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { KpiDataService } from '../kpis/kpi-data.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { GeneratedReport, ReportDataset } from './report-dataset.js';
import { generateCsv } from './services/csv-generator.js';
import { generateExcel } from './services/excel-generator.js';
import { generatePdf } from './services/pdf-generator.js';

export type ReportFormat = 'CSV' | 'EXCEL' | 'PDF';

export interface GenerateReportParams {
  format: ReportFormat;
  dashboardId?: string;
  kpiIds?: string[];
  from?: Date;
  to?: Date;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly kpiData: KpiDataService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Build the normalised dataset for a report.
   * KPI resolution order:
   *   1. If dashboardId given — extract kpiIds from that dashboard's widget configs.
   *   2. If kpiIds given — use them directly.
   *   3. If neither — collect all visible KPIs via dashboardSummary.
   */
  async buildDataset(params: Pick<GenerateReportParams, 'dashboardId' | 'kpiIds' | 'from' | 'to'>): Promise<ReportDataset> {
    const ctx = RequestContextStore.require();

    // ── Org name ──────────────────────────────────────────────────────────────
    const org = await this.prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    });
    const orgName = org?.name ?? 'Unknown Org';

    // ── Resolve KPI IDs ───────────────────────────────────────────────────────
    let resolvedKpiIds: string[] | undefined;

    if (params.dashboardId) {
      const dashboard = await this.prisma.dashboard.findFirst({
        where: { id: params.dashboardId, organizationId: ctx.organizationId, deletedAt: null },
        select: { widgets: { select: { config: true } } },
      });
      if (!dashboard) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Dashboard not found' });
      }
      const ids = new Set<string>();
      for (const widget of dashboard.widgets) {
        const cfg = widget.config as Record<string, unknown> | null;
        if (cfg && typeof cfg['kpiId'] === 'string') {
          ids.add(cfg['kpiId']);
        }
      }
      resolvedKpiIds = Array.from(ids);
    } else if (params.kpiIds && params.kpiIds.length > 0) {
      resolvedKpiIds = params.kpiIds;
    }
    // else: undefined → dashboardSummary returns all visible KPIs.

    // ── Fetch summary for the resolved KPI set ────────────────────────────────
    // dashboardSummary respects visibility + org scope.
    const summary = await this.kpiData.dashboardSummary({ from: params.from, to: params.to });
    const summaryMap = new Map(summary.map((s) => [s.kpiId, s]));

    const effectiveIds = resolvedKpiIds ?? Array.from(summaryMap.keys());

    // ── For each KPI, fetch recent data points ────────────────────────────────
    const kpis = await Promise.all(
      effectiveIds.map(async (kpiId) => {
        const row = summaryMap.get(kpiId);
        if (!row) {
          // KPI outside visibility — skip silently (access control via kpiData).
          return null;
        }

        const points = await this.kpiData.listForKpi(kpiId, {
          from: params.from,
          to: params.to,
          limit: 1000,
        });

        return {
          id: row.kpiId,
          name: row.name,
          unit: row.unit,
          latestValue: row.latestValue,
          points: points.map((p) => ({ recordedAt: p.recordedAt, value: p.value })),
        };
      }),
    );

    return {
      orgName,
      generatedAt: new Date(),
      kpis: kpis.filter((k): k is NonNullable<typeof k> => k !== null),
    };
  }

  /**
   * Generate a report: build dataset and dispatch to the appropriate generator.
   * Returns the raw buffer + content metadata for the controller to stream.
   */
  async generate(params: GenerateReportParams): Promise<GeneratedReport> {
    if (!params.dashboardId && (!params.kpiIds || params.kpiIds.length === 0)) {
      // Allow: will fall through to all-visible-KPIs from dashboardSummary.
      this.logger.log('ReportsService.generate: no dashboardId/kpiIds given — generating for all visible KPIs');
    }

    const dataset = await this.buildDataset(params);

    if (dataset.kpis.length === 0) {
      throw new BadRequestException({
        code: 'NO_DATA',
        message: 'No KPI data available for the requested scope',
      });
    }

    switch (params.format) {
      case 'CSV':
        return generateCsv(dataset);
      case 'EXCEL':
        return generateExcel(dataset);
      case 'PDF':
        return generatePdf(dataset);
      default: {
        // Exhaustiveness guard.
        const _never: never = params.format;
        throw new BadRequestException({ code: 'UNSUPPORTED_FORMAT', message: `Unsupported report format: ${String(_never)}` });
      }
    }
  }
}
