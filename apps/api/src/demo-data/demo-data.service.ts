import { Injectable } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

interface DemoKpi {
  name: string;
  type: 'NUMBER' | 'PERCENTAGE' | 'CURRENCY' | 'COUNT';
  unit: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  base: number;
  step: number;
}

const DEMO_MARKER = 'Demo Metrics';
const DEMO_KPIS: DemoKpi[] = [
  { name: 'Monthly Revenue (demo)', type: 'CURRENCY', unit: 'USD', direction: 'HIGHER_IS_BETTER', base: 50000, step: 4000 },
  { name: 'Active Users (demo)', type: 'COUNT', unit: 'users', direction: 'HIGHER_IS_BETTER', base: 1200, step: 90 },
  { name: 'NPS (demo)', type: 'NUMBER', unit: 'pts', direction: 'HIGHER_IS_BETTER', base: 35, step: 3 },
  { name: 'Churn Rate (demo)', type: 'PERCENTAGE', unit: '%', direction: 'LOWER_IS_BETTER', base: 5, step: -0.3 },
];

export interface SeedResult {
  alreadySeeded: boolean;
  categories: number;
  kpis: number;
  dataPoints: number;
}

/**
 * Seeds a small, realistic demo dataset (1 category, 4 KPIs, 6 monthly points
 * each) into the caller's org. Idempotent: a second call detects the demo
 * category and no-ops. Writes directly via Prisma (demo data needs no
 * versioning/quota path).
 */
@Injectable()
export class DemoDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async seed(): Promise<SeedResult> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPICategory.findFirst({
      where: { organizationId: ctx.organizationId, name: DEMO_MARKER },
      select: { id: true },
    });
    if (existing) return { alreadySeeded: true, categories: 0, kpis: 0, dataPoints: 0 };

    const category = await this.prisma.kPICategory.create({
      data: { organizationId: ctx.organizationId, name: DEMO_MARKER, description: 'Sample KPIs for exploring the app' },
      select: { id: true },
    });

    // 6 month-ends ending at a fixed reference month (no Date.now reliance for determinism).
    const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    let kpiCount = 0;
    let pointCount = 0;
    for (const def of DEMO_KPIS) {
      const kpi = await this.prisma.kPI.create({
        data: {
          organizationId: ctx.organizationId,
          categoryId: category.id,
          name: def.name,
          unit: def.unit,
          scope: 'ORG_WIDE',
          type: def.type,
          direction: def.direction,
          frequency: 'MONTHLY',
          aggregationMethod: 'LAST',
          status: 'ACTIVE',
          ownerUserId: ctx.userId,
          createdById: ctx.userId,
        },
        select: { id: true },
      });
      kpiCount += 1;

      const points: Prisma.KPIDataPointCreateManyInput[] = months.map((m, i) => {
        const start = new Date(`${m}-01T00:00:00.000Z`);
        const end = new Date(`${m}-28T00:00:00.000Z`);
        const value = Math.round((def.base + def.step * i) * 100) / 100;
        return {
          organizationId: ctx.organizationId,
          kpiId: kpi.id,
          value,
          unit: def.unit,
          periodStart: start,
          periodEnd: end,
          recordedAt: end,
          recordedById: ctx.userId,
          sourceType: 'MANUAL',
        };
      });
      await this.prisma.kPIDataPoint.createMany({ data: points });
      pointCount += points.length;
    }

    await this.audit.record({ action: 'CREATE', entityType: 'Organization', entityId: ctx.organizationId, metadata: { seedDemoData: true, kpis: kpiCount, dataPoints: pointCount } });
    return { alreadySeeded: false, categories: 1, kpis: kpiCount, dataPoints: pointCount };
  }
}
