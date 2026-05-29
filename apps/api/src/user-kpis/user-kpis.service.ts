import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { AssignUserKpiDto } from './dto/user-kpi.dto.js';

export interface MyKpiRow {
  assignmentId: string;
  kpiId: string;
  name: string;
  unit: string | null;
  targetValue: number | null;
  currentValue: number | null;
  status: string | null;
}

@Injectable()
export class UserKpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Assign a PER_USER KPI to a user (admin/manager action). Refuses other scopes. */
  async assign(dto: AssignUserKpiDto): Promise<{ id: string }> {
    const ctx = RequestContextStore.require();
    const kpi = await this.prisma.kPI.findFirst({
      where: { id: dto.kpiId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true, scope: true },
    });
    if (!kpi) throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    if (kpi.scope !== 'PER_USER') {
      throw new UnprocessableEntityException({
        code: 'SCOPE_MISMATCH',
        message: `Cannot assign a ${kpi.scope} KPI to a user; only PER_USER KPIs are user-assignable`,
        details: { scope: kpi.scope },
      });
    }
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });

    const saved = await this.prisma.kPIAssignmentUser.upsert({
      where: { kpiId_userId: { kpiId: dto.kpiId, userId: dto.userId } },
      create: {
        organizationId: ctx.organizationId,
        kpiId: dto.kpiId,
        userId: dto.userId,
        targetValue: dto.targetValue ?? null,
      },
      update: { targetValue: dto.targetValue ?? null },
      select: { id: true },
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'KPIAssignmentUser',
      entityId: saved.id,
      metadata: { kpiId: dto.kpiId, userId: dto.userId },
    });
    return saved;
  }

  async unassign(assignmentId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.kPIAssignmentUser.findFirst({
      where: { id: assignmentId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    await this.prisma.kPIAssignmentUser.delete({ where: { id: assignmentId } });
    await this.audit.record({ action: 'DELETE', entityType: 'KPIAssignmentUser', entityId: assignmentId });
  }

  /** The caller's own PER_USER assignments with current value + status. */
  listMyKpis(): Promise<MyKpiRow[]> {
    return this.rowsForUser(RequestContextStore.require().userId);
  }

  /** A specific user's PER_USER assignments (admin/manager view). */
  async listForUser(userId: string): Promise<MyKpiRow[]> {
    const ctx = RequestContextStore.require();
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return this.rowsForUser(userId);
  }

  /** Direct reports of the caller, each with their PER_USER assignments. */
  async listTeam(): Promise<Array<{ userId: string; fullName: string; kpis: MyKpiRow[] }>> {
    const ctx = RequestContextStore.require();
    const reports = await this.prisma.user.findMany({
      where: { organizationId: ctx.organizationId, managerId: ctx.userId },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return Promise.all(
      reports.map(async (r) => ({ userId: r.id, fullName: r.fullName, kpis: await this.rowsForUser(r.id) })),
    );
  }

  private async rowsForUser(userId: string): Promise<MyKpiRow[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.kPIAssignmentUser.findMany({
      where: { organizationId: ctx.organizationId, userId },
      select: {
        id: true,
        kpiId: true,
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
      targetValue: r.targetValue,
      currentValue: r.currentValue,
      status: r.status,
    }));
  }
}
