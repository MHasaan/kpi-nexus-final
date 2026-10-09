import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { BUILTIN_TEMPLATES } from './builtins.js';
import { type PayloadCounts, type TemplatePayload, countPayload, normalizeTemplatePayload } from './template-payload.js';

export interface TemplateSummary {
  slug: string;
  name: string;
  description: string | null;
  tier: string;
  orgType: string | null;
  industry: string | null;
  isBuiltin: boolean;
  popularity: number;
  counts: PayloadCounts;
}

@Injectable()
export class OrgTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotently seed the builtin templates (upsert by slug). Builtins are
   * global (organizationId NULL), which only kpi_system may write under RLS —
   * so this always runs on the system connection (OT-014).
   */
  async seedBuiltins(): Promise<void> {
    await RequestContextStore.runWithBypass('org-templates-seed', () => this.upsertBuiltins());
  }

  /**
   * The template routes are public (pre-signup gallery): with no tenant context
   * the read runs on the system connection, otherwise under the caller's RLS.
   */
  private read<T>(fn: (anonymous: boolean) => Promise<T>): Promise<T> {
    if (RequestContextStore.get()) return fn(false);
    return Promise.resolve(RequestContextStore.runWithBypass('org-templates-public', () => fn(true)));
  }

  private async upsertBuiltins(): Promise<void> {
    for (const t of BUILTIN_TEMPLATES) {
      await this.prisma.orgTemplate.upsert({
        where: { slug: t.slug },
        create: {
          slug: t.slug,
          name: t.name,
          description: t.description,
          tier: t.tier,
          orgType: t.orgType ?? null,
          industry: t.industry ?? null,
          payload: t.payload as unknown as object,
          isBuiltin: true,
          isPublic: true,
        },
        update: {
          name: t.name,
          description: t.description,
          tier: t.tier,
          payload: t.payload as unknown as object,
        },
      });
    }
  }

  /** Public list of builtin (+ public) templates with section counts. */
  async list(filter: { tier?: string; industry?: string; orgType?: string } = {}): Promise<TemplateSummary[]> {
    await this.seedBuiltins();
    const rows = await this.read(() =>
      this.prisma.orgTemplate.findMany({
        where: {
          isPublic: true,
          ...(filter.tier ? { tier: filter.tier } : {}),
          ...(filter.industry ? { industry: filter.industry } : {}),
          ...(filter.orgType ? { orgType: filter.orgType } : {}),
        },
        orderBy: [{ tier: 'asc' }, { popularity: 'desc' }, { name: 'asc' }],
      }),
    );
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      tier: r.tier,
      orgType: r.orgType,
      industry: r.industry,
      isBuiltin: r.isBuiltin,
      popularity: r.popularity,
      counts: countPayload(r.payload as unknown as TemplatePayload),
    }));
  }

  /** Full payload for a single template. */
  async preview(slug: string): Promise<{ slug: string; name: string; payload: TemplatePayload; counts: PayloadCounts }> {
    await this.seedBuiltins();
    // Anonymous callers see public templates only — never another org's private one.
    const row = await this.read((anonymous) =>
      this.prisma.orgTemplate.findFirst({ where: { slug, ...(anonymous ? { isPublic: true } : {}) } }),
    );
    if (!row) throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: `Template '${slug}' not found` });
    // Normalized: this payload is merged into the onboarding draft (applyTemplate),
    // so a legacy/malformed row must not inject non-conforming sections (BE-001).
    const payload = normalizeTemplatePayload(row.payload);
    return { slug: row.slug, name: row.name, payload, counts: countPayload(payload) };
  }
}
