import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { type UnitNode, computeInheritedAssignments } from './inheritance.js';

export interface UnitKpiRow {
  assignmentId: string;
  kpiId: string;
  name: string;
  unit: string | null;
  inherited: boolean;
  inheritedFromUnitId: string | null;
  targetValue: number | null;
  currentValue: number | null;
  status: string | null;
}

@Injectable()
export class OrgUnitKpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Assign a PER_UNIT KPI directly to a unit, then cascade inherited rows down. */
  async assign(orgUnitId: string, kpiId: string, targetValue?: number): Promise<{ id: string }> {
    const ctx = RequestContextStore.require();
    await this.requirePerUnitKpi(kpiId);
    await this.requireUnit(orgUnitId);

    const saved = await this.prisma.kPIAssignmentOrgUnit.upsert({
      where: { kpiId_orgUnitId: { kpiId, orgUnitId } },
      create: {
        organizationId: ctx.organizationId,
        kpiId,
        orgUnitId,
        inherited: false,
        targetValue: targetValue ?? null,
      },
      update: { inherited: false, inheritedFromUnitId: null, targetValue: targetValue ?? null },
      select: { id: true },
    });
    await this.recomputeInheritance(kpiId);
    await this.audit.record({ action: 'CREATE', entityType: 'KPIAssignmentOrgUnit', entityId: saved.id, metadata: { kpiId, orgUnitId } });
    return saved;
  }

  /** Promote an inherited assignment at a unit into a direct one. */
  async override(orgUnitId: string, kpiId: string): Promise<{ id: string }> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPIAssignmentOrgUnit.findFirst({
      where: { kpiId, orgUnitId, organizationId: ctx.organizationId },
      select: { id: true, inherited: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'No assignment to override at this unit' });
    }
    if (!existing.inherited) return { id: existing.id }; // already direct
    await this.prisma.kPIAssignmentOrgUnit.update({
      where: { id: existing.id },
      data: { inherited: false, inheritedFromUnitId: null },
    });
    await this.recomputeInheritance(kpiId);
    await this.audit.record({ action: 'UPDATE', entityType: 'KPIAssignmentOrgUnit', entityId: existing.id, metadata: { kpiId, orgUnitId, action: 'override' } });
    return { id: existing.id };
  }

  /** Remove the direct assignment at a unit; descendants re-inherit or are stripped. */
  async unassign(orgUnitId: string, kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPIAssignmentOrgUnit.findFirst({
      where: { kpiId, orgUnitId, organizationId: ctx.organizationId },
      select: { id: true, inherited: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    if (existing.inherited) {
      throw new UnprocessableEntityException({
        code: 'INHERITED_ROW',
        message: 'Cannot unassign an inherited row; unassign at the source unit or override here first',
      });
    }
    await this.prisma.kPIAssignmentOrgUnit.delete({ where: { id: existing.id } });
    await this.recomputeInheritance(kpiId);
    await this.audit.record({ action: 'DELETE', entityType: 'KPIAssignmentOrgUnit', entityId: existing.id, metadata: { kpiId, orgUnitId } });
  }

  /** All KPI assignments visible at a unit (direct + inherited). */
  async list(orgUnitId: string): Promise<UnitKpiRow[]> {
    const ctx = RequestContextStore.require();
    await this.requireUnit(orgUnitId);
    const rows = await this.prisma.kPIAssignmentOrgUnit.findMany({
      where: { orgUnitId, organizationId: ctx.organizationId },
      select: {
        id: true,
        kpiId: true,
        inherited: true,
        inheritedFromUnitId: true,
        targetValue: true,
        currentValue: true,
        status: true,
        kpi: { select: { name: true, unit: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      assignmentId: r.id,
      kpiId: r.kpiId,
      name: r.kpi.name,
      unit: r.kpi.unit,
      inherited: r.inherited,
      inheritedFromUnitId: r.inheritedFromUnitId,
      targetValue: r.targetValue,
      currentValue: r.currentValue,
      status: r.status,
    }));
  }

  /**
   * Recompute every inherited row for a KPI from scratch: keep direct rows,
   * delete all inherited rows, then recreate them from the nearest-direct-
   * ancestor mapping. Idempotent and robust to assign/override/unassign.
   */
  private async recomputeInheritance(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const units = await this.prisma.orgUnit.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, parentUnitId: true },
    });
    const direct = await this.prisma.kPIAssignmentOrgUnit.findMany({
      where: { kpiId, organizationId: ctx.organizationId, inherited: false },
      select: { orgUnitId: true },
    });
    const directIds = new Set(direct.map((d) => d.orgUnitId));
    const inheritors = computeInheritedAssignments(units as UnitNode[], directIds);

    await this.prisma.$transaction([
      this.prisma.kPIAssignmentOrgUnit.deleteMany({
        where: { kpiId, organizationId: ctx.organizationId, inherited: true },
      }),
      ...inheritors.map((i) =>
        this.prisma.kPIAssignmentOrgUnit.create({
          data: {
            organizationId: ctx.organizationId,
            kpiId,
            orgUnitId: i.unitId,
            inherited: true,
            inheritedFromUnitId: i.sourceUnitId,
          },
        }),
      ),
    ]);
  }

  private async requirePerUnitKpi(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { scope: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    if (kpi.scope !== 'PER_UNIT') {
      throw new UnprocessableEntityException({
        code: 'SCOPE_MISMATCH',
        message: `Cannot assign a ${kpi.scope} KPI to a unit; only PER_UNIT KPIs are unit-assignable`,
        details: { scope: kpi.scope },
      });
    }
  }

  private async requireUnit(orgUnitId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const unit = await this.prisma.orgUnit.findFirst({
      where: { id: orgUnitId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!unit) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Org unit not found' });
  }
}
