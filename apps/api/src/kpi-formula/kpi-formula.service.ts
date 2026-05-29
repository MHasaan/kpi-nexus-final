import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { FormulaError, parseFormula } from '../formula/formula.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  type DependencyEdge,
  extractIdentifiers,
  wouldCreateDependencyCycle,
} from './formula-deps.js';
import type { AttachFormulaDto } from './dto/formula.dto.js';

const formulaSelect = {
  id: true,
  organizationId: true,
  kpiId: true,
  raw: true,
  ast: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FormulaExpressionSelect;

export type PublicFormula = Prisma.FormulaExpressionGetPayload<{ select: typeof formulaSelect }>;

@Injectable()
export class KpiFormulaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(kpiId: string): Promise<PublicFormula | null> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    return this.prisma.formulaExpression.findFirst({
      where: { kpiId, organizationId: ctx.organizationId },
      select: formulaSelect,
    });
  }

  /**
   * Parse + persist a formula for a KPI, rebuilding its dependency edges.
   * Referenced identifiers resolve to KPIs by name within the org; unknown
   * names or a dependency cycle are rejected.
   */
  async attach(kpiId: string, dto: AttachFormulaDto): Promise<PublicFormula> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);

    let ast;
    try {
      ast = parseFormula(dto.raw);
    } catch (err) {
      if (err instanceof FormulaError) {
        throw new BadRequestException({ code: 'FORMULA_PARSE_ERROR', message: err.message });
      }
      throw err;
    }

    const identifiers = extractIdentifiers(ast);
    // Resolve identifier names → KPI ids within the org.
    const referenced = identifiers.length
      ? await this.prisma.kPI.findMany({
          where: { organizationId: ctx.organizationId, deletedAt: null, name: { in: identifiers } },
          select: { id: true, name: true },
        })
      : [];
    const byName = new Map(referenced.map((k) => [k.name, k.id]));
    const unknown = identifiers.filter((name) => !byName.has(name));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'UNKNOWN_KPI_REFS',
        message: `Formula references unknown KPI(s): ${unknown.join(', ')}`,
        details: { unknown },
      });
    }

    // Cycle check: each new edge is source(referenced) → dependent(this kpi).
    const existing = await this.prisma.kPIDependency.findMany({
      where: { organizationId: ctx.organizationId, dependentKpiId: { not: kpiId } },
      select: { sourceKpiId: true, dependentKpiId: true },
    });
    const edges: DependencyEdge[] = existing.map((e) => ({ sourceKpiId: e.sourceKpiId, dependentKpiId: e.dependentKpiId }));
    for (const [name, sourceId] of byName) {
      if (wouldCreateDependencyCycle(edges, sourceId, kpiId)) {
        throw new BadRequestException({
          code: 'FORMULA_CYCLE',
          message: `Formula creates a dependency cycle via KPI '${name}'`,
        });
      }
      // Add as we go so multi-reference formulas are checked against each other.
      edges.push({ sourceKpiId: sourceId, dependentKpiId: kpiId });
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const expr = await tx.formulaExpression.upsert({
        where: { kpiId },
        create: {
          organizationId: ctx.organizationId,
          kpiId,
          raw: dto.raw,
          ast: ast as unknown as Prisma.InputJsonValue,
        },
        update: { raw: dto.raw, ast: ast as unknown as Prisma.InputJsonValue },
        select: formulaSelect,
      });
      await tx.kPIDependency.deleteMany({ where: { organizationId: ctx.organizationId, dependentKpiId: kpiId } });
      if (byName.size > 0) {
        await tx.kPIDependency.createMany({
          data: [...byName].map(([name, sourceId]) => ({
            organizationId: ctx.organizationId,
            sourceKpiId: sourceId,
            dependentKpiId: kpiId,
            formulaRef: name,
          })),
        });
      }
      return expr;
    });

    await this.audit.record({
      action: 'UPDATE',
      entityType: 'FormulaExpression',
      entityId: saved.id,
      metadata: { kpiId, refs: [...byName.keys()] },
    });
    return saved;
  }

  async detach(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.requireKpi(kpiId);
    const existing = await this.prisma.formulaExpression.findFirst({
      where: { kpiId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI has no formula' });
    await this.prisma.$transaction([
      this.prisma.kPIDependency.deleteMany({ where: { organizationId: ctx.organizationId, dependentKpiId: kpiId } }),
      this.prisma.formulaExpression.delete({ where: { kpiId } }),
    ]);
    await this.audit.record({ action: 'DELETE', entityType: 'FormulaExpression', entityId: existing.id, metadata: { kpiId } });
  }

  private async requireKpi(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
  }
}
