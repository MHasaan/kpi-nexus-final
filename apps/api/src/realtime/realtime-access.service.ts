import { Injectable, Logger } from '@nestjs/common';
import type { RealtimeEvent } from '@kpi-nexus/contracts';

import { AlertsService } from '../alerts/alerts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessContextService } from '../rbac/services/access-context.service.js';
import type { KpiScope } from '../rbac/visibility/kpi-visibility.js';
import { type RequestContext, RequestContextStore } from '../tenancy/request-context.js';

interface KpiAccess {
  visible: boolean;
  userIds: string[] | null; // null ⇒ no user restriction
  unitIds: string[] | null; // null ⇒ no unit restriction
}

export interface RealtimeSubscriberFilter {
  allows(event: RealtimeEvent): Promise<boolean>;
}

/**
 * Per-subscriber gate for GET /realtime/stream. Events are published to the
 * whole organization, so each one is checked against what this subscriber may
 * read before it is written to their stream:
 *  - data_point_added: the KPI is visible and the point is in their point
 *    scope (a PER_USER point's userId, a PER_UNIT point's unit);
 *  - alert_triggered / alert_escalated: AlertsService's own alert visibility;
 *  - alert_digest: only the user it is for;
 *  - anything else: withheld until it is modelled here.
 * Checks run in the subscriber's request context, captured when the stream
 * opens; KPI access is cached for the life of the stream.
 */
@Injectable()
export class RealtimeAccessService {
  private readonly logger = new Logger(RealtimeAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContextService,
    private readonly alerts: AlertsService,
  ) {}

  /** Call inside the subscriber's request (it captures their context). */
  forSubscriber(): RealtimeSubscriberFilter {
    const ctx = RequestContextStore.require();
    const kpiCache = new Map<string, Promise<KpiAccess>>();
    const asSubscriber = <T>(fn: () => Promise<T>) => RequestContextStore.run(ctx, fn) as Promise<T>;

    const kpiAccess = (kpiId: string) => {
      let entry = kpiCache.get(kpiId);
      if (!entry) {
        entry = asSubscriber(() => this.loadKpiAccess(ctx, kpiId));
        // A failed lookup is not cached: the next event retries it.
        entry.catch(() => kpiCache.delete(kpiId));
        kpiCache.set(kpiId, entry);
      }
      return entry;
    };

    return {
      allows: async (event) => {
        try {
          switch (event.type) {
            case 'ping':
              return true;
            case 'data_point_added': {
              const access = await kpiAccess(event.kpiId);
              if (!access.visible) return false;
              if (access.userIds && !(event.userId !== null && access.userIds.includes(event.userId))) return false;
              if (access.unitIds && !(event.orgUnitId !== null && access.unitIds.includes(event.orgUnitId))) return false;
              return true;
            }
            case 'alert_triggered':
            case 'alert_escalated':
              return await asSubscriber(() => this.alerts.isVisible(event.alertId));
            case 'alert_digest':
              return event.userId === ctx.userId;
            default:
              return false;
          }
        } catch (err) {
          this.logger.warn(`realtime access check failed (event withheld): ${String(err)}`);
          return false;
        }
      },
    };
  }

  private async loadKpiAccess(ctx: RequestContext, kpiId: string): Promise<KpiAccess> {
    if (!(await this.accessContext.isKpiVisible(kpiId))) return { visible: false, userIds: null, unitIds: null };
    const kpi = await this.prisma.kPI.findFirst({ where: { id: kpiId, organizationId: ctx.organizationId }, select: { scope: true } });
    if (!kpi) return { visible: false, userIds: null, unitIds: null };
    const scope = await this.accessContext.kpiPointScopeWhere(kpi.scope as KpiScope);
    return { visible: true, userIds: scope.userId?.in ?? null, unitIds: scope.orgUnitId?.in ?? null };
  }
}
