import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { KpisService } from './kpis.service.js';
import { validateKpiCsv, type DryRunResult } from './kpi-import.js';
import type { CreateKpiDto } from './dto/create-kpi.dto.js';

@Injectable()
export class KpiImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisService,
  ) {}

  /** Parse + validate a CSV against the org's existing KPI names. */
  async dryRun(csvText: string): Promise<DryRunResult> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: null },
      select: { name: true },
    });
    return validateKpiCsv(csvText, new Set(existing.map((k) => k.name)));
  }

  /**
   * Re-validate then create every valid row through KpisService.create() so
   * audit/embedding/billing hooks fire per KPI. Fails closed (422) when the CSV
   * still has any errors — callers fix them in dry-run first.
   */
  async commit(csvText: string): Promise<{ createdCount: number; createdIds: string[] }> {
    const result = await this.dryRun(csvText);
    if (result.errors.length > 0) {
      throw new UnprocessableEntityException({
        code: 'IMPORT_VALIDATION_FAILED',
        message: 'CSV has validation errors — fix them and retry',
        details: { errors: result.errors },
      });
    }
    const createdIds: string[] = [];
    for (const row of result.valid) {
      const created = await this.kpis.create(row as CreateKpiDto);
      createdIds.push(created.id);
    }
    return { createdCount: createdIds.length, createdIds };
  }
}
