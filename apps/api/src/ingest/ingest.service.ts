import { Injectable } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { KpiDataService } from '../kpis/kpi-data.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { IngestDto } from './dto/ingest.dto.js';

export interface IngestResult {
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  succeeded: number;
  failed: number;
  jobId: string;
}

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly data: KpiDataService,
  ) {}

  async ingest(dto: IngestDto): Promise<IngestResult> {
    const ctx = RequestContextStore.require();
    const startedAt = new Date();

    const out = await this.data.bulkRecordOrgWide(
      dto.rows.map((r) => ({
        kpiId: r.kpiId,
        value: r.value,
        // Defensive coerce: the DTO already coerces, but guard against raw input.
        recordedAt: r.recordedAt ? new Date(r.recordedAt) : undefined,
        sourceType: 'INGESTION' as const,
        sourceRef: dto.source,
      })),
    );

    const status = out.failed === 0 ? 'SUCCEEDED' : out.succeeded === 0 ? 'FAILED' : 'PARTIAL';

    const job = await this.prisma.ingestionJob.create({
      data: {
        organizationId: ctx.organizationId,
        kind: 'webhook',
        source: {
          label: dto.source ?? 'api-key ingest',
          apiKeyId: ctx.apiKeyId ?? null,
          rowCount: dto.rows.length,
        } as Prisma.InputJsonValue,
        status,
        startedAt,
        finishedAt: new Date(),
        errorLog: out.errors.length > 0 ? out.errors.join('\n') : null,
      },
      select: { id: true },
    });

    return { status, succeeded: out.succeeded, failed: out.failed, jobId: job.id };
  }
}
