import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import type { KpiWatchEvent } from './kpi-watch.producer.js';

/** The caller's watches: which KPIs, and which events on each. */
@Injectable()
export class KpiWatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
  ) {}

  async list() {
    const ctx = RequestContextStore.require();
    return this.prisma.kPIWatch.findMany({
      where: { organizationId: ctx.organizationId, userId: ctx.userId },
      select: { id: true, kpiId: true, events: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(kpiId: string): Promise<{ watching: boolean; events: KpiWatchEvent[] }> {
    const ctx = RequestContextStore.require();
    const row = await this.prisma.kPIWatch.findFirst({
      where: { organizationId: ctx.organizationId, userId: ctx.userId, kpiId },
      select: { events: true },
    });
    return row ? { watching: true, events: row.events as KpiWatchEvent[] } : { watching: false, events: [] };
  }

  /** Watch (or change the events of) a KPI the caller can see; 404 otherwise. */
  async watch(kpiId: string, events: KpiWatchEvent[]): Promise<{ watching: true; events: KpiWatchEvent[] }> {
    const ctx = RequestContextStore.require();
    if (!(await this.accessContext.isKpiVisible(kpiId))) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'KPI not found' });
    }
    const row = await this.prisma.kPIWatch.upsert({
      where: { userId_kpiId: { userId: ctx.userId, kpiId } },
      create: { organizationId: ctx.organizationId, userId: ctx.userId, kpiId, events },
      update: { events },
      select: { events: true },
    });
    return { watching: true, events: row.events as KpiWatchEvent[] };
  }

  async unwatch(kpiId: string): Promise<void> {
    const ctx = RequestContextStore.require();
    await this.prisma.kPIWatch.deleteMany({ where: { organizationId: ctx.organizationId, userId: ctx.userId, kpiId } });
  }
}
