import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { DashboardsService } from './dashboards.service.js';
import type {
  AddWidgetDto,
  UpdateWidgetDto,
  UpdateWidgetPositionDto,
} from './dto/dashboard.dto.js';

const widgetSelect = {
  id: true,
  organizationId: true,
  dashboardId: true,
  widgetType: true,
  title: true,
  config: true,
  position: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DashboardWidgetSelect;

export type PublicWidget = Prisma.DashboardWidgetGetPayload<{
  select: typeof widgetSelect;
}>;

@Injectable()
export class WidgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dashboards: DashboardsService,
  ) {}

  /** Reuses DashboardsService.getById, so visibility + tenancy are enforced. */
  private async assertDashboardAccess(dashboardId: string): Promise<void> {
    await this.dashboards.getById(dashboardId);
  }

  async list(dashboardId: string): Promise<PublicWidget[]> {
    await this.assertDashboardAccess(dashboardId);
    return this.prisma.dashboardWidget.findMany({
      where: { dashboardId },
      select: widgetSelect,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async add(dashboardId: string, dto: AddWidgetDto): Promise<PublicWidget> {
    const ctx = RequestContextStore.require();
    await this.assertDashboardAccess(dashboardId);

    // Default sortOrder to (max existing + 1) so newly added widgets land
    // at the bottom of the explicit order.
    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(dashboardId));

    const created = await this.prisma.dashboardWidget.create({
      data: {
        organizationId: ctx.organizationId,
        dashboardId,
        widgetType: dto.widgetType,
        title: dto.title,
        config: dto.config as Prisma.InputJsonValue,
        position: dto.position as unknown as Prisma.InputJsonValue,
        sortOrder,
      },
      select: widgetSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'DashboardWidget',
      entityId: created.id,
      metadata: { dashboardId, widgetType: created.widgetType },
    });
    return created;
  }

  async update(
    dashboardId: string,
    widgetId: string,
    dto: UpdateWidgetDto,
  ): Promise<PublicWidget> {
    await this.assertDashboardAccess(dashboardId);
    const existing = await this.findWidget(dashboardId, widgetId);

    const updated = await this.prisma.dashboardWidget.update({
      where: { id: existing.id },
      data: {
        widgetType: dto.widgetType,
        title: dto.title,
        config: dto.config as Prisma.InputJsonValue | undefined,
        position: dto.position as unknown as Prisma.InputJsonValue | undefined,
        sortOrder: dto.sortOrder,
      },
      select: widgetSelect,
    });
    await this.audit.record({
      action: 'UPDATE',
      entityType: 'DashboardWidget',
      entityId: updated.id,
      metadata: { dashboardId },
    });
    return updated;
  }

  /**
   * Fast-path for drag/resize. Skips audit (firing on every 350ms PATCH
   * during a drag would flood the log); the broader UPDATE audit covers
   * the meaningful edit transitions.
   */
  async updatePosition(
    dashboardId: string,
    widgetId: string,
    position: UpdateWidgetPositionDto,
  ): Promise<PublicWidget> {
    await this.assertDashboardAccess(dashboardId);
    const existing = await this.findWidget(dashboardId, widgetId);

    return this.prisma.dashboardWidget.update({
      where: { id: existing.id },
      data: { position: position as unknown as Prisma.InputJsonValue },
      select: widgetSelect,
    });
  }

  async remove(dashboardId: string, widgetId: string): Promise<void> {
    await this.assertDashboardAccess(dashboardId);
    const existing = await this.findWidget(dashboardId, widgetId);
    await this.prisma.dashboardWidget.delete({ where: { id: existing.id } });
    await this.audit.record({
      action: 'DELETE',
      entityType: 'DashboardWidget',
      entityId: existing.id,
      metadata: { dashboardId },
    });
  }

  private async findWidget(
    dashboardId: string,
    widgetId: string,
  ): Promise<PublicWidget> {
    const ctx = RequestContextStore.require();
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: {
        id: widgetId,
        dashboardId,
        organizationId: ctx.organizationId,
      },
      select: widgetSelect,
    });
    if (!widget) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Widget not found' });
    }
    return widget;
  }

  private async nextSortOrder(dashboardId: string): Promise<number> {
    const last = await this.prisma.dashboardWidget.findFirst({
      where: { dashboardId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }
}
