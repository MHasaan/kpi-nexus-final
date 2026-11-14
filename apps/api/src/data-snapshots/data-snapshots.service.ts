import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { KpiDataService } from '../kpis/kpi-data.service.js';
import { KpisService } from '../kpis/kpis.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';

const MAX_POINTS = 1000;

export interface SnapshotSummary {
  id: string;
  reason: string | null;
  takenById: string;
  takenAt: Date;
  pointCount: number;
}

interface KpiSnapshotPayload {
  kpi: Record<string, unknown>;
  points: Array<{ period: string; value: number; userId: string | null; orgUnitId: string | null }>;
}

/**
 * Point-in-time KPI snapshots (DataSnapshot). A snapshot holds the values its
 * taker could read when it was taken, so only its taker and admins may see it.
 */
@Injectable()
export class DataSnapshotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kpis: KpisService,
    private readonly kpiData: KpiDataService,
    private readonly accessContext: AccessContextService,
  ) {}

  private summary(row: { id: string; reason: string | null; takenById: string; takenAt: Date; payload: unknown }): SnapshotSummary {
    const points = (row.payload as KpiSnapshotPayload | null)?.points ?? [];
    return { id: row.id, reason: row.reason, takenById: row.takenById, takenAt: row.takenAt, pointCount: points.length };
  }

  async takeKpiSnapshot(kpiId: string, reason?: string): Promise<SnapshotSummary> {
    const ctx = RequestContextStore.require();
    const kpi = await this.kpis.getById(kpiId); // KPI visibility (404 otherwise)
    const points = await this.kpiData.listForKpi(kpiId, { limit: MAX_POINTS }); // the taker's readable points
    const payload: KpiSnapshotPayload = {
      kpi: kpi as unknown as Record<string, unknown>,
      points: points.map((p) => ({ period: p.periodStart.toISOString().slice(0, 10), value: p.value, userId: p.userId, orgUnitId: p.orgUnitId })),
    };
    const row = await this.prisma.dataSnapshot.create({
      data: {
        organizationId: ctx.organizationId,
        entityType: 'KPI',
        entityId: kpiId,
        payload: payload as unknown as Prisma.InputJsonValue,
        reason: reason ?? null,
        takenById: ctx.userId,
      },
      select: { id: true, reason: true, takenById: true, takenAt: true, payload: true },
    });
    return this.summary(row);
  }

  /** The caller's snapshots of the KPI (every snapshot for an admin), newest first, without payloads. */
  async listKpiSnapshots(kpiId: string): Promise<SnapshotSummary[]> {
    const rows = await this.prisma.dataSnapshot.findMany({
      where: await this.scopeWhere(kpiId),
      select: { id: true, reason: true, takenById: true, takenAt: true, payload: true },
      orderBy: { takenAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => this.summary(r));
  }

  async getKpiSnapshot(kpiId: string, snapshotId: string) {
    const row = await this.prisma.dataSnapshot.findFirst({
      where: { ...(await this.scopeWhere(kpiId)), id: snapshotId },
      select: { id: true, reason: true, takenById: true, takenAt: true, payload: true },
    });
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Snapshot not found' });
    return row;
  }

  private async scopeWhere(kpiId: string): Promise<Prisma.DataSnapshotWhereInput> {
    const ctx = RequestContextStore.require();
    const isAdmin = (await this.accessContext.resolveForCurrentPrincipal()).isAdmin;
    return {
      organizationId: ctx.organizationId,
      entityType: 'KPI',
      entityId: kpiId,
      ...(isAdmin ? {} : { takenById: ctx.userId }),
    };
  }
}
