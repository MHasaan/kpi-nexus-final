import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { NotificationDispatcherService } from '../notifications/notification-dispatcher.service.js';
import { NotificationDigestService } from '../notifications/notification-digest.service.js';
import { EscalationsService, ESCALATION_QUEUE, type EscalationJobData } from './escalations.service.js';

interface EscalationLevel {
  delayMinutes: number;
  channelIds: string[];
  notifyRoleIds: string[];
  notifyUserIds: string[];
}

/**
 * Fires one escalation level for an alert: aborts if the alert is no longer
 * OPEN (acknowledged/resolved in the meantime), otherwise dispatches to the
 * level's channels + notified users (IN_APP), publishes `alert_escalated`, and
 * schedules the next level after its configured delay.
 */
@Processor(ESCALATION_QUEUE)
export class EscalationProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly realtime: RealtimeService,
    private readonly escalations: EscalationsService,
    private readonly digest: NotificationDigestService,
  ) {
    super();
  }

  async process(job: Job<EscalationJobData>): Promise<void> {
    const { alertId, organizationId, level } = job.data;
    await RequestContextStore.run(
      {
        userId: 'escalation-system',
        organizationId,
        roleId: null,
        principalType: 'user',
        bypassRls: true,
      },
      () => this.fireLevel(alertId, organizationId, level),
    );
  }

  private async fireLevel(alertId: string, organizationId: string, level: number): Promise<void> {
    const alert = await this.prisma.alert.findFirst({
      where: { id: alertId, organizationId },
      select: { id: true, status: true, alertRuleId: true, kpiId: true, targetUserId: true },
    });
    if (!alert) return;

    // OPEN guard — stop escalating an alert that was acknowledged/resolved.
    if (alert.status !== 'OPEN') {
      this.logger.debug(`Alert ${alertId} no longer OPEN (status ${alert.status}) — escalation halted`);
      return;
    }
    if (!alert.alertRuleId) return;

    const esc = await this.prisma.escalationRule.findFirst({
      where: { alertRuleId: alert.alertRuleId, organizationId },
      select: { levels: true },
    });
    const levels = (esc?.levels as EscalationLevel[] | undefined) ?? [];
    const current = levels[level];
    if (!current) return;

    // Resolve role members → user ids, merge with explicit notifyUserIds.
    const roleUserIds =
      current.notifyRoleIds.length > 0
        ? (
            await this.prisma.user.findMany({
              where: { organizationId, roleId: { in: current.notifyRoleIds } },
              select: { id: true },
            })
          ).map((u) => u.id)
        : [];
    const userIds = Array.from(new Set([...current.notifyUserIds, ...roleUserIds]));

    // Dispatch to configured channels (one delivery each) + IN_APP per user.
    await this.dispatcher.dispatch({
      organizationId,
      alertId,
      channelIds: current.channelIds,
      includeInApp: userIds.length > 0,
      targetUserId: alert.targetUserId,
    });

    // Kick the digest collator for each notified user (collapses within window).
    for (const uid of userIds) {
      await this.digest.enqueueDigest(organizationId, uid);
    }

    try {
      await this.realtime.publish(organizationId, {
        type: 'alert_escalated',
        alertId,
        kpiId: alert.kpiId,
        level,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(`alert_escalated publish failed for ${alertId}: ${String(err)}`);
    }

    // Schedule the next level after its delay, if one exists.
    const next = levels[level + 1];
    if (next) {
      await this.escalations.enqueueLevel(
        alertId,
        organizationId,
        level + 1,
        next.delayMinutes * 60_000,
      );
    }
  }
}
