import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import type { KpiScope } from '../rbac/visibility/kpi-visibility.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { KPI_WATCH_QUEUE, type KpiWatchJobData } from './kpi-watch.producer.js';

function message(event: KpiWatchJobData['event'], kpiName: string, detail?: string): string {
  switch (event) {
    case 'data_point_added':
      return `Watching: a new value was recorded for ${kpiName}`;
    case 'threshold_breached':
      return `Watching: an alert rule fired for ${kpiName}`;
    case 'anomaly_confirmed':
      return `Watching: an anomaly was confirmed on ${kpiName}`;
    case 'status_changed':
      return `Watching: ${kpiName} is now ${detail ?? 'changed'}`;
  }
}

/**
 * Tells a KPI's watchers about an event. Each watcher is checked AS THEMSELF
 * (their own request context): the KPI must still be visible to them, and a
 * new value must be within their point scope. The actor is skipped. The
 * notice is a personal LOW alert (isPersonal, targetUserId = watcher, no rule):
 * only the watcher sees it, and it still never carries the value.
 */
@Processor(KPI_WATCH_QUEUE)
export class KpiWatchProcessor extends WorkerHost {
  private readonly logger = new Logger(KpiWatchProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
    private readonly realtime: RealtimeService,
  ) {
    super();
  }

  async process(job: Job<KpiWatchJobData>): Promise<void> {
    const e = job.data;
    const system = { userId: 'kpi-watch', organizationId: e.organizationId, roleId: null, principalType: 'user' as const, bypassRls: true };
    const loaded = await RequestContextStore.run(system, async () => {
      const kpi = await this.prisma.kPI.findFirst({ where: { id: e.kpiId, organizationId: e.organizationId }, select: { id: true, name: true, scope: true } });
      const watches = await this.prisma.kPIWatch.findMany({
        where: { organizationId: e.organizationId, kpiId: e.kpiId, events: { has: e.event } },
        select: { userId: true },
      });
      return { kpi, watches };
    });
    if (!loaded.kpi) return;

    for (const { userId } of loaded.watches) {
      if (userId === e.actorUserId) continue;
      const user = await RequestContextStore.run(system, () =>
        this.prisma.user.findFirst({ where: { id: userId, organizationId: e.organizationId }, select: { id: true, roleId: true } }),
      );
      if (!user) continue;
      const watcher = { userId, organizationId: e.organizationId, roleId: user.roleId, principalType: 'user' as const, bypassRls: true };
      const allowed = await RequestContextStore.run(watcher, async () => {
        if (!(await this.accessContext.isKpiVisible(e.kpiId))) return false;
        if (e.event !== 'data_point_added') return true;
        const scope = await this.accessContext.kpiPointScopeWhere(loaded.kpi!.scope as KpiScope);
        if (scope.userId && !(e.pointUserId && scope.userId.in.includes(e.pointUserId))) return false;
        if (scope.orgUnitId && !(e.pointOrgUnitId && scope.orgUnitId.in.includes(e.pointOrgUnitId))) return false;
        return true;
      });
      if (!allowed) continue;

      const text = message(e.event, loaded.kpi.name, e.detail);
      const alert = await RequestContextStore.run(system, () =>
        this.prisma.alert.create({
          data: { organizationId: e.organizationId, kpiId: e.kpiId, alertRuleId: null, targetUserId: userId, isPersonal: true, message: text, severity: 'LOW', status: 'OPEN' },
          select: { id: true, createdAt: true },
        }),
      );
      try {
        await this.realtime.publish(e.organizationId, {
          type: 'alert_triggered',
          alertId: alert.id,
          alertRuleId: null,
          kpiId: e.kpiId,
          severity: 'LOW',
          message: text,
          createdAt: alert.createdAt.toISOString(),
        });
      } catch (err) {
        this.logger.warn(`kpi-watch realtime publish failed for alert ${alert.id}: ${String(err)}`);
      }
    }
  }
}
