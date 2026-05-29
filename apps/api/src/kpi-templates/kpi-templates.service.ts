import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { KpisService, type PublicKpi } from '../kpis/kpis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { GLOBAL_TEMPLATES } from './global-templates.js';
import { type TemplateFilters, rankTemplates } from './template-ranking.js';
import type { CreateTemplateDto, InstantiateTemplateDto } from './dto/template.dto.js';

const templateSelect = {
  id: true,
  organizationId: true,
  slug: true,
  name: true,
  description: true,
  type: true,
  direction: true,
  frequency: true,
  aggregationMethod: true,
  scorecardQuadrant: true,
  function: true,
  industry: true,
  unit: true,
  unitConfig: true,
  targetSummary: true,
  tags: true,
  popularity: true,
  isGlobal: true,
  isBuiltin: true,
  createdAt: true,
} satisfies Prisma.KPITemplateSelect;

export type PublicKpiTemplate = Prisma.KPITemplateGetPayload<{ select: typeof templateSelect }>;

@Injectable()
export class KpiTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly kpis: KpisService,
  ) {}

  /**
   * Templates visible to the caller's org (global + org-private), filtered and
   * ranked in-memory. Lazily seeds the builtin catalog on first call.
   */
  async list(filters: TemplateFilters): Promise<PublicKpiTemplate[]> {
    await this.seedGlobalIfEmpty();
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPITemplate.findMany({
      where: { OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] },
      select: templateSelect,
    });
    return rankTemplates(rows, filters);
  }

  /** Idempotently seed the builtin global catalog when no global templates exist. */
  async seedGlobalIfEmpty(): Promise<void> {
    const existing = await this.prisma.kPITemplate.count({ where: { organizationId: null, isGlobal: true } });
    if (existing > 0) return;
    await this.prisma.kPITemplate.createMany({
      data: GLOBAL_TEMPLATES.map((t) => ({
        organizationId: null,
        slug: t.slug,
        name: t.name,
        description: t.description,
        type: t.type,
        direction: t.direction,
        frequency: t.frequency,
        aggregationMethod: t.aggregationMethod,
        scorecardQuadrant: t.scorecardQuadrant,
        function: t.function,
        unit: t.unit,
        targetSummary: t.targetSummary,
        tags: t.tags,
        popularity: t.popularity,
        isGlobal: true,
        isBuiltin: true,
      })),
      skipDuplicates: true,
    });
  }

  /**
   * Clones a template into the caller's org as a DRAFT KPI, bumping the
   * template's popularity. Duplicate KPI names are refused by KpisService
   * (ConflictException). `ownerRoleId` from the original plan maps to
   * `ownerUserId` in the built schema (KPIs are owned by users).
   */
  async instantiate(templateId: string, dto: InstantiateTemplateDto): Promise<PublicKpi> {
    const template = await this.requireTemplate(templateId);

    const kpi = await this.kpis.create({
      name: dto.name ?? template.name,
      description: template.description ?? undefined,
      unit: template.unit ?? undefined,
      scope: 'ORG_WIDE',
      type: template.type,
      direction: template.direction,
      frequency: template.frequency,
      aggregationMethod: template.aggregationMethod ?? 'LAST',
      status: 'DRAFT',
      targetValue: dto.targetValue,
      allowNegative: false,
      ownerUserId: dto.ownerUserId,
      tags: template.tags,
    });

    await this.prisma.kPITemplate.update({
      where: { id: template.id },
      data: { popularity: { increment: 1 } },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'KPI',
      entityId: kpi.id,
      metadata: { instantiatedFromTemplate: template.slug },
    });
    return kpi;
  }

  /** Create an org-private template. */
  async create(dto: CreateTemplateDto): Promise<PublicKpiTemplate> {
    const ctx = RequestContextStore.require();
    const slug = `${ctx.organizationId}-${this.slugify(dto.name)}`;
    const created = await this.prisma.kPITemplate.create({
      data: {
        organizationId: ctx.organizationId,
        slug,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        direction: dto.direction,
        frequency: dto.frequency,
        aggregationMethod: dto.aggregationMethod,
        scorecardQuadrant: dto.scorecardQuadrant,
        function: dto.function,
        industry: dto.industry,
        unit: dto.unit,
        targetSummary: dto.targetSummary,
        tags: dto.tags,
        isGlobal: false,
        isBuiltin: false,
      },
      select: templateSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'KPITemplate', entityId: created.id, metadata: { slug } });
    return created;
  }

  private slugify(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60);
  }

  /** A template the caller may use: global (org-less) or owned by their org. */
  private async requireTemplate(id: string): Promise<PublicKpiTemplate> {
    const ctx = RequestContextStore.require();
    const t = await this.prisma.kPITemplate.findFirst({
      where: { id, OR: [{ organizationId: null }, { organizationId: ctx.organizationId }] },
      select: templateSelect,
    });
    if (!t) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Template not found' });
    return t;
  }
}
