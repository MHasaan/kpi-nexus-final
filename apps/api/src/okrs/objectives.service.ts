import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { scopedUserIds } from '../rbac/visibility/domain-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import {
  periodOrdered,
  type CreateObjectiveDto,
  type ListObjectivesQuery,
  type UpdateObjectiveDto,
} from './dto/okr.dto.js';
import { keyResultProgress, objectiveProgress } from './progress-math.js';

const MAX_ROLLUP_DEPTH = 10;

const objectiveSelect = {
  id: true,
  organizationId: true,
  name: true,
  description: true,
  ownerUserId: true,
  parentObjectiveId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  progress: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ObjectiveSelect;

export type PublicObjective = Prisma.ObjectiveGetPayload<{ select: typeof objectiveSelect }>;

@Injectable()
export class ObjectivesService {
  private readonly logger = new Logger(ObjectivesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessContext: AccessContextService,
  ) {}

  /** `{ in: ids }` restricting objectives to owners in the OKRS scope, or
   *  `undefined` (ORG / admin ⇒ no owner narrowing). Default OKRS scope is ORG ⇒
   *  undefined ⇒ all objectives in tenant (parity). */
  private async ownerScope(): Promise<{ in: string[] } | undefined> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    if (profile.isAdmin) return undefined;
    const scope = profile.scopeByDomain.OKRS ?? 'ORG';
    if (scope === 'ORG') return undefined;
    const unitMemberUserIds = scope === 'UNITS' ? await this.accessContext.unitMemberUserIds() : [];
    const ids = scopedUserIds(scope, {
      userId: ctx.userId,
      directReportIds: profile.context.directReportIds,
      unitMemberUserIds,
    })!; // non-null: scope !== ORG
    return { in: ids };
  }

  async list(query: ListObjectivesQuery): Promise<PublicObjective[]> {
    const ctx = RequestContextStore.require();
    const ownerScope = await this.ownerScope();
    const where: Prisma.ObjectiveWhereInput = {
      organizationId: ctx.organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.parentObjectiveId ? { parentObjectiveId: query.parentObjectiveId } : {}),
    };
    // Owner: an explicit query filter is intersected with the scope ceiling.
    if (ownerScope && query.ownerUserId) {
      where.AND = [{ ownerUserId: query.ownerUserId }, { ownerUserId: ownerScope }];
    } else if (ownerScope) {
      where.ownerUserId = ownerScope;
    } else if (query.ownerUserId) {
      where.ownerUserId = query.ownerUserId;
    }
    return this.prisma.objective.findMany({
      where,
      select: objectiveSelect,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async getById(id: string): Promise<PublicObjective> {
    const ctx = RequestContextStore.require();
    const obj = await this.prisma.objective.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: objectiveSelect,
    });
    if (!obj) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Objective not found' });
    const ownerScope = await this.ownerScope();
    if (ownerScope && (obj.ownerUserId == null || !ownerScope.in.includes(obj.ownerUserId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Objective not found' });
    }
    return obj;
  }

  async create(dto: CreateObjectiveDto): Promise<PublicObjective> {
    const ctx = RequestContextStore.require();
    if (dto.parentObjectiveId) await this.getById(dto.parentObjectiveId); // tenant-check parent
    const created = await this.prisma.objective.create({
      data: {
        organizationId: ctx.organizationId,
        name: dto.name,
        description: dto.description,
        ownerUserId: dto.ownerUserId,
        parentObjectiveId: dto.parentObjectiveId,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        status: dto.status,
      },
      select: objectiveSelect,
    });
    await this.audit.record({ action: 'CREATE', entityType: 'Objective', entityId: created.id, metadata: { name: created.name } });
    return created;
  }

  async update(id: string, dto: UpdateObjectiveDto): Promise<PublicObjective> {
    const current = await this.getById(id);
    if (dto.parentObjectiveId) {
      await this.getById(dto.parentObjectiveId);
      await this.assertNotOwnAncestor(id, dto.parentObjectiveId);
    }
    if (
      !periodOrdered({
        periodStart: dto.periodStart ?? current.periodStart,
        periodEnd: dto.periodEnd ?? current.periodEnd,
      })
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'periodEnd must be on or after periodStart',
      });
    }
    const updated = await this.prisma.objective.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ownerUserId: dto.ownerUserId,
        parentObjectiveId: dto.parentObjectiveId,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        status: dto.status,
      },
      select: objectiveSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'Objective', entityId: id });
    return updated;
  }

  /**
   * Reject a re-parent that would make `id` its own ancestor (BE-020). Walks up
   * from the proposed parent within the org — unscoped, so an ancestor the caller
   * can't see still counts. A visited set stops on cycles already in the data.
   */
  private async assertNotOwnAncestor(id: string, parentId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const visited = new Set<string>();
    let cursor: string | null = parentId;
    while (cursor && !visited.has(cursor)) {
      if (cursor === id) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'An objective cannot be aligned under itself or one of its own sub-objectives',
        });
      }
      visited.add(cursor);
      const row: { parentObjectiveId: string | null } | null = await this.prisma.objective.findFirst({
        where: { id: cursor, organizationId: ctx.organizationId },
        select: { parentObjectiveId: true },
      });
      cursor = row?.parentObjectiveId ?? null;
    }
  }

  async remove(id: string): Promise<void> {
    await this.getById(id);
    await this.prisma.objective.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'Objective', entityId: id });
  }

  /**
   * Recompute a KR's progress from its values, aggregate the objective's
   * progress (KRs + child objectives), persist, then walk up the parent chain.
   * A `visited` set + depth cap make a malformed parent cycle safe — we log and
   * stop rather than throw (an OKR list page must never 500 over bad data).
   */
  async recomputeObjectiveProgress(objectiveId: string, visited: Set<string> = new Set(), depth = 0): Promise<void> {
    if (depth > MAX_ROLLUP_DEPTH || visited.has(objectiveId)) {
      if (depth > MAX_ROLLUP_DEPTH) {
        this.logger.warn(`OKR rollup exceeded depth ${MAX_ROLLUP_DEPTH} at ${objectiveId} — stopping (possible cycle)`);
      }
      return;
    }
    visited.add(objectiveId);

    const ctx = RequestContextStore.require();
    const objective = await this.prisma.objective.findFirst({
      where: { id: objectiveId, organizationId: ctx.organizationId },
      select: { id: true, parentObjectiveId: true },
    });
    if (!objective) return;

    const krs = await this.prisma.keyResult.findMany({
      where: { organizationId: ctx.organizationId, objectiveId },
      select: { id: true, baselineValue: true, targetValue: true, currentValue: true, weight: true, progress: true },
    });

    // Recompute each KR's progress from its current values and persist drift.
    const krWeights = [] as Array<{ progress: number; weight: number }>;
    for (const kr of krs) {
      const p = keyResultProgress(kr);
      if (Math.abs(p - kr.progress) > 1e-9) {
        await this.prisma.keyResult.update({ where: { id: kr.id }, data: { progress: p } });
      }
      krWeights.push({ progress: p, weight: kr.weight });
    }

    const children = await this.prisma.objective.findMany({
      where: { organizationId: ctx.organizationId, parentObjectiveId: objectiveId },
      select: { progress: true },
    });

    const progress = objectiveProgress(krWeights, children.map((c) => ({ progress: c.progress })));
    await this.prisma.objective.update({ where: { id: objectiveId }, data: { progress } });

    if (objective.parentObjectiveId) {
      await this.recomputeObjectiveProgress(objective.parentObjectiveId, visited, depth + 1);
    }
  }

  /**
   * A key result may be linked only to a KPI of this organisation that the
   * caller can see (BE-055). Syncing copies the linked KPI's value into the
   * key result, so a link to a KPI out of the caller's sight would hand them
   * its value. Out of sight answers as missing, as `GET /kpis/:id` does.
   */
  async assertKpiLinkable(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!kpi || !(await this.accessContext.isKpiVisible(kpiId))) {
      throw new NotFoundException({ code: 'KPI_NOT_FOUND', message: 'The KPI to link was not found' });
    }
  }

  /**
   * For each KR with a linked KPI, pull the latest data point value into the
   * KR's currentValue, then recompute the objective (and roll up).
   *
   * Whose value (BE-053): a key result is read by everyone who sees the
   * objective, so it never takes "the newest value recorded by anyone". An
   * organisation-wide or per-unit KPI gives its organisation-level value; a
   * per-person KPI gives the objective owner's own value. With no such value
   * the key result keeps what it had.
   */
  async syncFromLinkedKpis(objectiveId: string): Promise<PublicObjective> {
    const ctx = RequestContextStore.require();
    const objective = await this.getById(objectiveId);

    const krs = await this.prisma.keyResult.findMany({
      where: { organizationId: ctx.organizationId, objectiveId, kpiId: { not: null } },
      select: { id: true, kpiId: true },
    });

    const kpiIds = [...new Set(krs.map((kr) => kr.kpiId).filter((id): id is string => id !== null))];
    const scopeOf = await this.kpiScopes(kpiIds);

    for (const kr of krs) {
      if (!kr.kpiId) continue;
      const value = await this.valueForKeyResult(objective.ownerUserId, kr.kpiId, scopeOf.get(kr.kpiId));
      if (value !== null) {
        await this.prisma.keyResult.update({ where: { id: kr.id }, data: { currentValue: value } });
      }
    }

    await this.recomputeObjectiveProgress(objectiveId);
    return this.getById(objectiveId);
  }

  /**
   * The value a key result of an objective owned by `ownerUserId` takes from
   * `kpiId` — the same rule as the sync (BE-053), for when a link is made
   * (QA-L9). Null when the KPI has no such value.
   */
  async linkedKpiValue(ownerUserId: string | null, kpiId: string): Promise<number | null> {
    const scopeOf = await this.kpiScopes([kpiId]);
    return this.valueForKeyResult(ownerUserId, kpiId, scopeOf.get(kpiId));
  }

  private async kpiScopes(kpiIds: string[]): Promise<Map<string, string>> {
    if (kpiIds.length === 0) return new Map();
    const ctx = RequestContextStore.require();
    const kinds = await this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, id: { in: kpiIds } },
      select: { id: true, scope: true },
    });
    return new Map(kinds.map((k) => [k.id, k.scope]));
  }

  private async valueForKeyResult(ownerUserId: string | null, kpiId: string, scope: string | undefined): Promise<number | null> {
    const ctx = RequestContextStore.require();
    const whose = scope === 'PER_USER' ? (ownerUserId ? { userId: ownerUserId } : null) : { userId: null, orgUnitId: null };
    if (!whose) return null;
    const latest = await this.prisma.kPIDataPoint.findFirst({
      where: { organizationId: ctx.organizationId, kpiId, ...whose },
      // Newest period first ("latest" = newest period; entry time breaks ties).
      orderBy: [{ periodStart: 'desc' }, { recordedAt: 'desc' }],
      select: { value: true },
    });
    return latest?.value ?? null;
  }
}
