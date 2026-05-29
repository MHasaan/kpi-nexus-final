import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { computeBenchmarkValue, resolveCutoff } from './benchmark-compute.js';
import type { ComputeBenchmarkDto, CreateBenchmarkDto } from './dto/benchmark.dto.js';

const benchmarkSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  kind: true,
  value: true,
  periodStart: true,
  periodEnd: true,
  source: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.KPIBenchmarkSelect;

export type PublicKpiBenchmark = Prisma.KPIBenchmarkGetPayload<{ select: typeof benchmarkSelect }>;

@Injectable()
export class KpiBenchmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(kpiId: string): Promise<PublicKpiBenchmark[]> {
    await this.requireKpi(kpiId);
    return this.prisma.kPIBenchmark.findMany({
      where: { kpiId, organizationId: RequestContextStore.require().organizationId },
      select: benchmarkSelect,
      orderBy: [{ kind: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(kpiId: string, dto: CreateBenchmarkDto): Promise<PublicKpiBenchmark> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    const created = await this.prisma.kPIBenchmark.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        kind: dto.kind,
        value: dto.value,
        periodStart: dto.periodStart ?? null,
        periodEnd: dto.periodEnd ?? null,
        source: dto.source ?? null,
        createdById: ctx.userId,
      },
      select: benchmarkSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'KPIBenchmark', entityId: created.id, metadata: { kpiId, kind: created.kind } });
    return created;
  }

  async remove(id: string): Promise<void> {
    await this.requireBenchmark(id);
    await this.prisma.kPIBenchmark.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'KPIBenchmark', entityId: id });
  }

  /**
   * Computes an INTERNAL_HISTORICAL benchmark by averaging every data point
   * recorded in the last `days` days, persisting the result as a benchmark row.
   * Throws 422 when the KPI has no data points in the window.
   */
  async compute(kpiId: string, dto: ComputeBenchmarkDto): Promise<PublicKpiBenchmark> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    const now = new Date();
    const cutoff = resolveCutoff(now, dto.days);

    const points = await this.prisma.kPIDataPoint.findMany({
      where: { kpiId, organizationId: ctx.organizationId, recordedAt: { gte: cutoff } },
      select: { value: true },
    });
    const value = computeBenchmarkValue(points.map((p) => p.value));
    if (value === null) {
      throw new BadRequestException({
        code: 'NO_DATA',
        message: `No data points recorded in the last ${dto.days} days to compute a benchmark`,
      });
    }

    const created = await this.prisma.kPIBenchmark.create({
      data: {
        organizationId: ctx.organizationId,
        kpiId,
        kind: dto.kind,
        value,
        periodStart: cutoff,
        periodEnd: now,
        source: `computed:internal_historical:${dto.days}d:n=${points.length}`,
        createdById: ctx.userId,
      },
      select: benchmarkSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'KPIBenchmark', entityId: created.id, metadata: { kpiId, kind: created.kind, computed: true, n: points.length } });
    return created;
  }

  private async requireKpi(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
  }

  private async requireBenchmark(id: string): Promise<PublicKpiBenchmark> {
    const ctx = RequestContextStore.require();
    const b = await this.prisma.kPIBenchmark.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: benchmarkSelect,
    });
    if (!b) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Benchmark not found' });
    return b;
  }
}
