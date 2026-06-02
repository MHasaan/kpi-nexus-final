import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { ApprovalGateService } from '../approvals/approval-gate.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BillingService } from '../billing/billing.service.js';
import { ReembedProducer } from '../nlq/reembed.producer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildKpiVisibilityWhere,
  kpiContextFromProfile,
  type KpiVisibilityContext,
} from '../rbac/visibility/kpi-visibility.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { CreateKpiDto, UpdateKpiDto } from './dto/create-kpi.dto.js';
import { type KpiStatus, canTransition } from './kpi-status.js';

const kpiSelect = {
  id: true,
  organizationId: true,
  categoryId: true,
  name: true,
  description: true,
  unit: true,
  scope: true,
  type: true,
  direction: true,
  frequency: true,
  aggregationMethod: true,
  status: true,
  targetValue: true,
  warningThreshold: true,
  criticalThreshold: true,
  allowNegative: true,
  scorecardQuadrant: true,
  ownerUserId: true,
  tags: true,
  isActive: true,
  isArchived: true,
  version: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  orgUnitAssignments: {
    select: { id: true, orgUnitId: true, createdAt: true },
  },
  userAssignments: {
    select: { id: true, userId: true, createdAt: true },
  },
} satisfies Prisma.KPISelect;

export type PublicKpi = Prisma.KPIGetPayload<{ select: typeof kpiSelect }>;

@Injectable()
export class KpisService {
  private readonly logger = new Logger(KpisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accessContext: AccessContextService,
    private readonly billing: BillingService,
    @Optional() private readonly approvalGate?: ApprovalGateService,
    @Optional() private readonly reembedProducer?: ReembedProducer,
  ) {}

  async list(): Promise<PublicKpi[]> {
    RequestContextStore.require(); // assert tenant context
    const visibility = await this.buildVisibilityContext();
    const where = buildKpiVisibilityWhere(visibility);

    return this.prisma.kPI.findMany({
      where: {
        ...where,
        deletedAt: null,
      } as Prisma.KPIWhereInput,
      select: kpiSelect,
      orderBy: [{ name: 'asc' }],
    });
  }

  async getById(id: string): Promise<PublicKpi> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: null },
      select: kpiSelect,
    });
    if (!kpi) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    // Enforce visibility on single-get too — Manager/Employee can't peek at
    // PER_USER KPIs assigned to other users, even with the id.
    const visibility = await this.buildVisibilityContext();
    if (!visibility.isAdmin) {
      const visible = await this.isVisibleToUser(kpi, visibility);
      if (!visible) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
      }
    }
    return kpi;
  }

  async create(dto: CreateKpiDto): Promise<PublicKpi> {
    const ctx = RequestContextStore.require();
    await this.billing.assertWithinQuota('kpis', 1);
    this.assertScopeAssignments(dto.scope, dto);

    if (dto.categoryId) {
      const cat = await this.prisma.kPICategory.findFirst({
        where: { id: dto.categoryId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!cat) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'categoryId is invalid or belongs to another tenant',
        });
      }
    }
    if (dto.ownerUserId) {
      const owner = await this.prisma.user.findFirst({
        where: { id: dto.ownerUserId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!owner) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'ownerUserId is invalid or belongs to another tenant',
        });
      }
    }
    if (dto.orgUnitIds && dto.orgUnitIds.length > 0) {
      const count = await this.prisma.orgUnit.count({
        where: {
          id: { in: dto.orgUnitIds },
          organizationId: ctx.organizationId,
        },
      });
      if (count !== dto.orgUnitIds.length) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'one or more orgUnitIds are invalid or belong to another tenant',
        });
      }
    }
    if (dto.userIds && dto.userIds.length > 0) {
      const count = await this.prisma.user.count({
        where: {
          id: { in: dto.userIds },
          organizationId: ctx.organizationId,
        },
      });
      if (count !== dto.userIds.length) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'one or more userIds are invalid or belong to another tenant',
        });
      }
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const kpi = await tx.kPI.create({
          data: {
            organizationId: ctx.organizationId,
            categoryId: dto.categoryId,
            name: dto.name,
            description: dto.description,
            unit: dto.unit,
            scope: dto.scope,
            type: dto.type,
            direction: dto.direction,
            frequency: dto.frequency,
            aggregationMethod: dto.aggregationMethod,
            status: dto.status,
            targetValue: dto.targetValue,
            warningThreshold: dto.warningThreshold,
            criticalThreshold: dto.criticalThreshold,
            allowNegative: dto.allowNegative,
            scorecardQuadrant: dto.scorecardQuadrant,
            ownerUserId: dto.ownerUserId,
            tags: dto.tags,
            createdById: ctx.userId,
          },
          select: { id: true },
        });
        if (dto.scope === 'PER_UNIT' && dto.orgUnitIds) {
          await tx.kPIAssignmentOrgUnit.createMany({
            data: dto.orgUnitIds.map((orgUnitId) => ({
              organizationId: ctx.organizationId,
              kpiId: kpi.id,
              orgUnitId,
            })),
          });
        }
        if (dto.scope === 'PER_USER' && dto.userIds) {
          await tx.kPIAssignmentUser.createMany({
            data: dto.userIds.map((userId) => ({
              organizationId: ctx.organizationId,
              kpiId: kpi.id,
              userId,
            })),
          });
        }
        const full = await tx.kPI.findUniqueOrThrow({
          where: { id: kpi.id },
          select: kpiSelect,
        });
        // Initial version snapshot (version 1).
        await tx.kPIVersion.create({
          data: {
            kpiId: kpi.id,
            version: 1,
            snapshot: full as unknown as Prisma.InputJsonValue,
            reason: 'created',
            createdById: ctx.userId,
          },
        });
        return full;
      });

      await this.audit.record({
        action: 'CREATE',
        entityType: 'KPI',
        entityId: created.id,
        metadata: { name: created.name, scope: created.scope },
      });

      // Fire-and-forget: errors must not fail the KPI write.
      if (this.reembedProducer) {
        try {
          await this.reembedProducer.enqueueKpi(ctx.organizationId, created.id);
        } catch (err) {
          this.logger.warn(`reembed enqueue failed after KPI create ${created.id}: ${String(err)}`);
        }
      }

      return created;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A KPI with this name already exists in this organization',
        });
      }
      throw error;
    }
  }

  async update(
    id: string,
    dto: UpdateKpiDto,
    opts: { bypassApproval?: boolean } = {},
  ): Promise<PublicKpi> {
    const existing = await this.getById(id);

    // Approval seam: if a definition change (anything beyond a pure status
    // transition) is captured by an active KPI_DEFINITION workflow, this throws
    // 202 and records a pending request instead of mutating.
    if (this.approvalGate && !opts.bypassApproval && !isStatusOnlyKpiPatch(dto)) {
      await this.approvalGate.requireApprovalIfActive('KPI_DEFINITION', id, dto, {
        ...opts,
        currentPayload: existing,
      });
    }

    if (dto.scope && dto.scope !== existing.scope) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'KPI scope is immutable — create a new KPI to change scope',
      });
    }
    if (dto.scope || dto.orgUnitIds || dto.userIds) {
      this.assertScopeAssignments(existing.scope, dto);
    }

    try {
      const updated = await this.prisma.kPI.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          unit: dto.unit,
          type: dto.type,
          direction: dto.direction,
          frequency: dto.frequency,
          aggregationMethod: dto.aggregationMethod,
          status: dto.status,
          targetValue: dto.targetValue,
          warningThreshold: dto.warningThreshold,
          criticalThreshold: dto.criticalThreshold,
          allowNegative: dto.allowNegative,
          scorecardQuadrant: dto.scorecardQuadrant,
          ownerUserId: dto.ownerUserId,
          tags: dto.tags,
          version: { increment: 1 },
        },
        select: kpiSelect,
      });

      await this.prisma.kPIVersion.create({
        data: {
          kpiId: updated.id,
          version: updated.version,
          snapshot: updated as unknown as Prisma.InputJsonValue,
          reason: 'updated',
          createdById: RequestContextStore.require().userId,
        },
      });

      await this.audit.record({
        action: 'UPDATE',
        entityType: 'KPI',
        entityId: updated.id,
        metadata: { name: updated.name, version: updated.version },
      });

      // Enqueue re-embedding only when semantic catalog fields change. A
      // pure status/threshold/target update does not change the NLQ source
      // text, so we skip the queue to avoid unnecessary AI token spend.
      if (this.reembedProducer && needsReembed(existing, dto)) {
        const { organizationId } = RequestContextStore.require();
        try {
          await this.reembedProducer.enqueueKpi(organizationId, updated.id);
        } catch (err) {
          this.logger.warn(`reembed enqueue failed after KPI update ${updated.id}: ${String(err)}`);
        }
      }

      return updated;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'A KPI with this name already exists in this organization',
        });
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.getById(id);
    await this.prisma.kPI.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), isArchived: true },
    });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'KPI',
      entityId: existing.id,
      metadata: { name: existing.name, soft: true },
    });
  }

  /** Soft-deleted (archived) KPIs in the org — for the archive/trash view. */
  listArchived(): Promise<PublicKpi[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.kPI.findMany({
      where: { organizationId: ctx.organizationId, deletedAt: { not: null } },
      select: kpiSelect,
      orderBy: { deletedAt: 'desc' },
    });
  }

  /** Restore a soft-deleted KPI. */
  async restore(id: string): Promise<PublicKpi> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPI.findFirst({
      where: { id, organizationId: ctx.organizationId, deletedAt: { not: null } },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Archived KPI not found' });
    await this.prisma.kPI.update({ where: { id }, data: { deletedAt: null, isArchived: false } });
    await this.audit.record({ action: 'UPDATE', entityType: 'KPI', entityId: id, metadata: { name: existing.name, restored: true } });
    return this.prisma.kPI.findUniqueOrThrow({ where: { id }, select: kpiSelect });
  }

  /** Hard-delete a soft-deleted KPI (and its dependent rows via cascade). Requires it be archived first. */
  async purge(id: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPI.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    if (existing.deletedAt === null) {
      throw new UnprocessableEntityException({ code: 'NOT_ARCHIVED', message: 'Archive the KPI before purging it' });
    }
    await this.prisma.kPI.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'KPI', entityId: id, metadata: { name: existing.name, purged: true } });
  }

  /**
   * Move a KPI through its lifecycle state machine (see kpi-status.ts). Rejects
   * illegal transitions with 422; bumps version + writes a KPIVersion snapshot.
   */
  async transitionStatus(id: string, to: KpiStatus, reason?: string): Promise<PublicKpi> {
    const ctx = RequestContextStore.require();
    const existing = await this.getById(id);
    const from = existing.status as KpiStatus;
    if (from === to) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: `KPI is already ${to}` });
    }
    if (!canTransition(from, to)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot transition KPI from ${from} to ${to}`,
        details: { from, to },
      });
    }
    const updated = await this.prisma.kPI.update({
      where: { id },
      data: { status: to, version: { increment: 1 } },
      select: kpiSelect,
    });
    await this.prisma.kPIVersion.create({
      data: {
        kpiId: id,
        version: updated.version,
        snapshot: updated as unknown as Prisma.InputJsonValue,
        reason: reason ? `status:${from}→${to} — ${reason}` : `status:${from}→${to}`,
        createdById: ctx.userId,
      },
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'KPI',
      entityId: id,
      metadata: { statusFrom: from, statusTo: to },
    });
    return updated;
  }

  /** Version history for a KPI (newest first). */
  async listVersions(id: string): Promise<
    Array<{ id: string; version: number; reason: string | null; createdById: string; createdAt: Date }>
  > {
    await this.getById(id); // tenant + existence
    return this.prisma.kPIVersion.findMany({
      where: { kpiId: id },
      select: { id: true, version: true, reason: true, createdById: true, createdAt: true },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Build the visibility context the visibility helper needs. Reads the
   * principal's OrgUnit memberships + direct reports from the DB.
   */
  private async buildVisibilityContext(): Promise<KpiVisibilityContext> {
    const ctx = RequestContextStore.require();
    const profile = await this.accessContext.resolveForCurrentPrincipal();
    return kpiContextFromProfile(ctx.organizationId, ctx.userId, profile);
  }

  private async isVisibleToUser(
    kpi: PublicKpi,
    visibility: Awaited<ReturnType<KpisService['buildVisibilityContext']>>,
  ): Promise<boolean> {
    // Layer-3 category allowlist (Phase 3): KPIs outside the allowed categories are
    // hidden for everyone the filter applies to — including ORG_WIDE. A null allowlist
    // (admins + unconfigured roles) means all categories (parity).
    if (
      visibility.allowedCategoryIds != null &&
      !(kpi.categoryId != null && visibility.allowedCategoryIds.includes(kpi.categoryId))
    ) {
      return false;
    }
    if (kpi.scope === 'ORG_WIDE') return true;
    if (kpi.scope === 'PER_UNIT') {
      const allowedUnits = new Set([
        ...visibility.managedOrgUnitIds,
        ...visibility.memberOrgUnitIds,
      ]);
      return kpi.orgUnitAssignments.some((a) => allowedUnits.has(a.orgUnitId));
    }
    if (kpi.scope === 'PER_USER') {
      const allowedUsers = new Set([visibility.userId, ...visibility.directReportIds]);
      return kpi.userAssignments.some((a) => allowedUsers.has(a.userId));
    }
    return false;
  }

  private assertScopeAssignments(
    scope: 'ORG_WIDE' | 'PER_UNIT' | 'PER_USER',
    dto: { orgUnitIds?: string[] | undefined; userIds?: string[] | undefined },
  ) {
    if (scope === 'ORG_WIDE') {
      if ((dto.orgUnitIds && dto.orgUnitIds.length > 0) || (dto.userIds && dto.userIds.length > 0)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'ORG_WIDE KPIs cannot have orgUnitIds or userIds assignments',
        });
      }
    }
    if (scope === 'PER_UNIT') {
      if (!dto.orgUnitIds || dto.orgUnitIds.length === 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'PER_UNIT KPIs require at least one orgUnitId',
        });
      }
      if (dto.userIds && dto.userIds.length > 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'PER_UNIT KPIs cannot have userIds assignments',
        });
      }
    }
    if (scope === 'PER_USER') {
      if (!dto.userIds || dto.userIds.length === 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'PER_USER KPIs require at least one userId',
        });
      }
      if (dto.orgUnitIds && dto.orgUnitIds.length > 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'PER_USER KPIs cannot have orgUnitIds assignments',
        });
      }
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}

/**
 * A patch that only changes `status` is a lifecycle transition, not a
 * definition change — it bypasses the KPI_DEFINITION approval gate so workflow
 * status moves (draft → active, etc.) stay frictionless.
 */
function isStatusOnlyKpiPatch(dto: UpdateKpiDto): boolean {
  const definedKeys = Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined);
  return definedKeys.length > 0 && definedKeys.every((k) => k === 'status');
}

/**
 * Returns true when any of the fields that contribute to the NLQ catalog
 * source text (name, description, tags, unit) have changed. These are the
 * same fields that `sourceTextForKpi` in embedding-helpers.ts concatenates.
 */
function needsReembed(existing: PublicKpi, dto: UpdateKpiDto): boolean {
  if (dto.name !== undefined && dto.name !== existing.name) return true;
  if (dto.description !== undefined && dto.description !== existing.description) return true;
  if (dto.unit !== undefined && dto.unit !== existing.unit) return true;
  if (dto.tags !== undefined) {
    // Compare tag arrays by value (order-independent via sorted join).
    const oldTags = [...(existing.tags ?? [])].sort().join(',');
    const newTags = [...dto.tags].sort().join(',');
    if (oldTags !== newTags) return true;
  }
  return false;
}
