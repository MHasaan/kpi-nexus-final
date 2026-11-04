import { Injectable } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { DashboardsService } from '../dashboards/dashboards.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { scoreMatch } from './search-score.js';

export type SearchType = 'kpi' | 'dashboard' | 'user' | 'orgUnit';

export interface SearchResult {
  type: SearchType;
  id: string;
  label: string;
  score: number;
  sublabel?: string;
}

const PER_TYPE_CAP = 12;
const OVERALL_CAP = 50;

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
    private readonly dashboards: DashboardsService,
  ) {}

  async search(q: string, opts: { types?: SearchType[]; limit?: number }): Promise<SearchResult[]> {
    const query = q.trim();
    if (!query) return [];
    const ctx = RequestContextStore.require();
    const want = (t: SearchType) => !opts.types || opts.types.includes(t);
    const contains = { contains: query, mode: 'insensitive' as const };
    // Every result type follows the caller's visibility (null ⇒ unrestricted).
    // KPIs and dashboards leaked across scopes before; people and units follow
    // the PEOPLE / ORG scopes (BE-004).
    const [kpiIds, peopleIds, unitIds, dashboardWhere] = await Promise.all([
      want('kpi') ? this.accessContext.visibleKpiIds() : null,
      want('user') ? this.accessContext.visiblePeopleIds() : null,
      want('orgUnit') ? this.accessContext.visibleOrgUnitIds() : null,
      want('dashboard') ? this.dashboards.visibilityWhere() : null,
    ]);
    const onlyIds = (ids: string[] | null) => (ids ? { id: { in: ids } } : {});

    const [kpis, dashboards, users, orgUnits] = await Promise.all([
      want('kpi')
        ? this.prisma.kPI.findMany({
            where: { organizationId: ctx.organizationId, deletedAt: null, ...onlyIds(kpiIds), OR: [{ name: contains }, { tags: { has: query } }] } as Prisma.KPIWhereInput,
            select: { id: true, name: true, tags: true },
            take: 50,
          })
        : Promise.resolve([]),
      want('dashboard')
        ? this.prisma.dashboard.findMany({ where: { ...dashboardWhere, name: contains }, select: { id: true, name: true }, take: 50 })
        : Promise.resolve([]),
      want('user')
        ? this.prisma.user.findMany({
            where: { organizationId: ctx.organizationId, ...onlyIds(peopleIds), status: { notIn: ['ARCHIVED', 'DELETED'] }, OR: [{ fullName: contains }, { email: contains }] },
            select: { id: true, fullName: true, email: true },
            take: 50,
          })
        : Promise.resolve([]),
      want('orgUnit')
        ? this.prisma.orgUnit.findMany({ where: { organizationId: ctx.organizationId, ...onlyIds(unitIds), name: contains }, select: { id: true, name: true }, take: 50 })
        : Promise.resolve([]),
    ]);

    const results: SearchResult[] = [];
    this.collect(results, kpis.map((k) => ({ id: k.id, label: k.name, score: Math.max(scoreMatch(k.name, query), tagScore(k.tags, query)) })), 'kpi');
    this.collect(results, dashboards.map((d) => ({ id: d.id, label: d.name, score: scoreMatch(d.name, query) })), 'dashboard');
    this.collect(results, users.map((u) => ({ id: u.id, label: u.fullName, sublabel: u.email, score: Math.max(scoreMatch(u.fullName, query), scoreMatch(u.email, query)) })), 'user');
    this.collect(results, orgUnits.map((o) => ({ id: o.id, label: o.name, score: scoreMatch(o.name, query) })), 'orgUnit');

    return results
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit ?? OVERALL_CAP);
  }

  private collect(out: SearchResult[], rows: Array<{ id: string; label: string; sublabel?: string; score: number }>, type: SearchType): void {
    const capped = rows
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, PER_TYPE_CAP);
    for (const r of capped) out.push({ type, id: r.id, label: r.label, sublabel: r.sublabel, score: r.score });
  }
}

function tagScore(tags: string[], query: string): number {
  return tags.some((t) => t.toLowerCase() === query.toLowerCase()) ? 1.0 : 0;
}
