import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { DashboardsService } from './dashboards.service.js';
import type { CaptureSnapshotDto } from './dto/dashboard.dto.js';

/** Shape stored as payload inside a DashboardSnapshot row. */
export interface SnapshotPayload {
  dashboard: {
    id: string;
    name: string;
    description: string | null;
    isShared: boolean;
    layout: unknown;
    version: number;
  };
  widgets: Array<{
    id: string;
    widgetType: string;
    title: string | null;
    config: unknown;
    position: unknown;
    sortOrder: number;
  }>;
  kpiValues: Record<
    string,
    { latestValue: number | null; latestRecordedAt: Date | null }
  >;
  capturedAt: string; // ISO-8601
}

const snapshotListSelect = {
  id: true,
  dashboardId: true,
  label: true,
  takenAt: true,
  takenById: true,
  takenBy: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
} satisfies Prisma.DashboardSnapshotSelect;

const snapshotFullSelect = {
  id: true,
  organizationId: true,
  dashboardId: true,
  label: true,
  payload: true,
  takenById: true,
  takenAt: true,
} satisfies Prisma.DashboardSnapshotSelect;

export type PublicSnapshotSummary = Prisma.DashboardSnapshotGetPayload<{
  select: typeof snapshotListSelect;
}>;

export type PublicSnapshotFull = Prisma.DashboardSnapshotGetPayload<{
  select: typeof snapshotFullSelect;
}>;

@Injectable()
export class SnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dashboards: DashboardsService,
  ) {}

  /**
   * Capture a frozen snapshot of the dashboard:
   *   1. Load dashboard + widgets (uses DashboardsService.getById for
   *      visibility + tenancy enforcement — throws 404 if invisible).
   *   2. Collect the distinct kpiIds referenced in widget configs.
   *   3. Fetch the latest data-point value for each kpiId directly from
   *      kPIDataPoint (avoiding a cross-module import of KpisModule).
   *   4. Compose the payload and persist a DashboardSnapshot row.
   */
  async capture(
    dashboardId: string,
    dto: CaptureSnapshotDto,
  ): Promise<PublicSnapshotFull> {
    const ctx = RequestContextStore.require();

    // Enforces visibility + org-scope; throws 404 if not found / not visible.
    const dashboard = await this.dashboards.getById(dashboardId);

    // Collect distinct kpiIds from widget configs.
    const kpiIds = new Set<string>();
    for (const widget of dashboard.widgets) {
      const cfg = widget.config as Record<string, unknown> | null;
      if (cfg && typeof cfg['kpiId'] === 'string') {
        kpiIds.add(cfg['kpiId']);
      }
    }

    // Fetch the latest data point for each kpiId within the org.
    const kpiValues: SnapshotPayload['kpiValues'] = {};
    await Promise.all(
      Array.from(kpiIds).map(async (kpiId) => {
        const point = await this.prisma.kPIDataPoint.findFirst({
          where: { organizationId: ctx.organizationId, kpiId },
          orderBy: { recordedAt: 'desc' },
          select: { value: true, recordedAt: true },
        });
        kpiValues[kpiId] = {
          latestValue: point?.value ?? null,
          latestRecordedAt: point?.recordedAt ?? null,
        };
      }),
    );

    const payload: SnapshotPayload = {
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        isShared: dashboard.isShared,
        layout: dashboard.layout,
        version: dashboard.version,
      },
      widgets: dashboard.widgets.map((w) => ({
        id: w.id,
        widgetType: w.widgetType,
        title: w.title,
        config: w.config,
        position: w.position,
        sortOrder: w.sortOrder,
      })),
      kpiValues,
      capturedAt: new Date().toISOString(),
    };

    const snapshot = await this.prisma.dashboardSnapshot.create({
      data: {
        organizationId: ctx.organizationId,
        dashboardId,
        label: dto.label,
        payload: payload as unknown as Prisma.InputJsonValue,
        takenById: ctx.userId,
      },
      select: snapshotFullSelect,
    });

    await this.audit.record({
      action: 'CREATE',
      entityType: 'DashboardSnapshot',
      entityId: snapshot.id,
      metadata: { dashboardId, label: dto.label ?? null },
    });

    return snapshot;
  }

  /**
   * List snapshot summaries for a dashboard (newest first).
   * Enforces dashboard visibility via DashboardsService.getById.
   */
  async list(dashboardId: string): Promise<PublicSnapshotSummary[]> {
    const ctx = RequestContextStore.require();
    // Throws 404 if the dashboard is missing or not visible to this principal.
    await this.dashboards.getById(dashboardId);

    return this.prisma.dashboardSnapshot.findMany({
      where: { organizationId: ctx.organizationId, dashboardId },
      select: snapshotListSelect,
      orderBy: { takenAt: 'desc' },
    });
  }

  /** Get a single snapshot with its full payload. */
  async get(snapshotId: string): Promise<PublicSnapshotFull> {
    const ctx = RequestContextStore.require();
    const snapshot = await this.prisma.dashboardSnapshot.findFirst({
      where: { id: snapshotId, organizationId: ctx.organizationId },
      select: snapshotFullSelect,
    });
    if (!snapshot) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Snapshot not found',
      });
    }
    return snapshot;
  }

  /** Hard-delete a snapshot (org-scoped; 404 if missing or cross-org). */
  async delete(snapshotId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.dashboardSnapshot.findFirst({
      where: { id: snapshotId, organizationId: ctx.organizationId },
      select: { id: true, dashboardId: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Snapshot not found',
      });
    }
    await this.prisma.dashboardSnapshot.delete({ where: { id: existing.id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'DashboardSnapshot',
      entityId: existing.id,
      metadata: { dashboardId: existing.dashboardId },
    });
  }
}
