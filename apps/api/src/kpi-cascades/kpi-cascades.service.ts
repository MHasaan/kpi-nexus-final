import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { CascadeService, type RollupResult } from '../kpis/cascade.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type CascadeEdge, computeLevels, wouldCreateCycle } from './cascade-graph.js';
import type { AttachCascadeDto } from './dto/cascade.dto.js';

const cascadeSelect = {
  id: true,
  organizationId: true,
  parentKpiId: true,
  childKpiId: true,
  method: true,
  weight: true,
  level: true,
  customFormula: true,
  lastComputedAt: true,
  createdAt: true,
} satisfies Prisma.KPICascadeSelect;

export type PublicCascade = Prisma.KPICascadeGetPayload<{ select: typeof cascadeSelect }>;

export interface CascadeTreeNode {
  parentKpiId: string;
  parentName: string;
  level: number;
  children: Array<{ childKpiId: string; childName: string; method: string; weight: number }>;
}

@Injectable()
export class KpiCascadesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cascade: CascadeService,
  ) {}

  async list(): Promise<PublicCascade[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.kPICascade.findMany({
      where: { organizationId: ctx.organizationId },
      select: cascadeSelect,
      orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async attach(dto: AttachCascadeDto): Promise<PublicCascade> {
    const ctx = RequestContextStore.require();
    if (dto.parentKpiId === dto.childKpiId) {
      throw new BadRequestException({ code: 'CASCADE_CYCLE', message: 'A KPI cannot cascade into itself' });
    }
    await this.requireKpi(dto.parentKpiId);
    await this.requireKpi(dto.childKpiId);

    const edges = await this.loadEdges();
    if (wouldCreateCycle(edges, dto.parentKpiId, dto.childKpiId)) {
      throw new BadRequestException({
        code: 'CASCADE_CYCLE',
        message: 'Attaching this child would create a cycle in the cascade graph',
      });
    }

    const saved = await this.prisma.kPICascade.upsert({
      where: { parentKpiId_childKpiId: { parentKpiId: dto.parentKpiId, childKpiId: dto.childKpiId } },
      create: {
        organizationId: ctx.organizationId,
        parentKpiId: dto.parentKpiId,
        childKpiId: dto.childKpiId,
        method: dto.method,
        weight: dto.weight,
        customFormula: dto.customFormula,
      },
      update: { method: dto.method, weight: dto.weight, customFormula: dto.customFormula },
      select: cascadeSelect,
    });

    await this.recomputeLevels();
    await this.audit.record({
      action: 'CREATE',
      entityType: 'KPICascade',
      entityId: saved.id,
      metadata: { parentKpiId: dto.parentKpiId, childKpiId: dto.childKpiId, method: dto.method },
    });
    // Return the row with its freshly-computed level.
    return this.prisma.kPICascade.findUniqueOrThrow({ where: { id: saved.id }, select: cascadeSelect });
  }

  async detach(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPICascade.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Cascade edge not found' });
    await this.prisma.kPICascade.delete({ where: { id } });
    await this.recomputeLevels();
    await this.audit.record({ action: 'DELETE', entityType: 'KPICascade', entityId: id });
  }

  async tree(): Promise<CascadeTreeNode[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPICascade.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        parentKpi: { select: { id: true, name: true } },
        childKpi: { select: { id: true, name: true } },
      },
      orderBy: [{ level: 'asc' }, { createdAt: 'asc' }],
    });
    const byParent = new Map<string, CascadeTreeNode>();
    for (const r of rows) {
      let node = byParent.get(r.parentKpiId);
      if (!node) {
        node = { parentKpiId: r.parentKpiId, parentName: r.parentKpi.name, level: r.level, children: [] };
        byParent.set(r.parentKpiId, node);
      }
      node.children.push({ childKpiId: r.childKpiId, childName: r.childKpi.name, method: r.method, weight: r.weight });
    }
    return [...byParent.values()];
  }

  /** Public rollup API — delegates to the shared CascadeService computer. */
  rollUp(parentKpiId: string, periodStart: Date, periodEnd: Date): Promise<RollupResult> {
    return this.cascade.computeForParent(parentKpiId, periodStart, periodEnd);
  }

  /** Recompute and persist `level` for every cascade edge in the org. */
  private async recomputeLevels(): Promise<void> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPICascade.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, parentKpiId: true, childKpiId: true },
    });
    const levels = computeLevels(rows.map((r) => ({ parentKpiId: r.parentKpiId, childKpiId: r.childKpiId })));
    await Promise.all(
      rows.map((r) =>
        this.prisma.kPICascade.update({
          where: { id: r.id },
          data: { level: levels.get(r.parentKpiId) ?? 0 },
        }),
      ),
    );
  }

  private async loadEdges(): Promise<CascadeEdge[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPICascade.findMany({
      where: { organizationId: ctx.organizationId },
      select: { parentKpiId: true, childKpiId: true },
    });
    return rows.map((r) => ({ parentKpiId: r.parentKpiId, childKpiId: r.childKpiId }));
  }

  private async requireKpi(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: `KPI ${kpiId} not found` });
  }
}
