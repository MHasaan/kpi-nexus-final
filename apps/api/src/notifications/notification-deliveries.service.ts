import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { NotificationDispatcherService } from './notification-dispatcher.service.js';

const deliverySelect = {
  id: true,
  organizationId: true,
  alertId: true,
  channelId: true,
  targetUserId: true,
  // How it went out (to a person: EMAIL…) and why a waiting one has not gone (DIGEST, MUTE_HOURS):
  // without them a page could only call an email to a person "in-app".
  kind: true,
  held: true,
  status: true,
  attempts: true,
  error: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.NotificationDeliverySelect;

export type PublicDelivery = Prisma.NotificationDeliveryGetPayload<{ select: typeof deliverySelect }> & {
  /** The channel it went through, by name; null when it went to a person (F-070: the page showed only an id). */
  channelName: string | null;
  /** The KPI and the alert's message, so the row says what failed. */
  kpiName: string | null;
  alertMessage: string | null;
};

@Injectable()
export class NotificationDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  async list(filter: {
    status?: 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED';
    from?: Date;
    to?: Date;
    limit?: number;
    /** Only the deliveries of this alert — its trail. */
    alertId?: string;
  }): Promise<PublicDelivery[]> {
    const ctx = RequestContextStore.require();
    const where: Prisma.NotificationDeliveryWhereInput = { organizationId: ctx.organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.alertId) where.alertId = filter.alertId;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    const rows = await this.prisma.notificationDelivery.findMany({
      where,
      select: deliverySelect,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(filter.limit ?? 100, 500),
    });
    return this.withNames(rows);
  }

  /** Manually re-attempt a failed delivery (DLQ retry). */
  async retry(id: string): Promise<PublicDelivery> {
    const ctx = RequestContextStore.require();
    const existing = await this.prisma.notificationDelivery.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Delivery not found' });
    }
    await this.dispatcher.attemptDelivery(id);
    const row = await this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id },
      select: deliverySelect,
    });
    return (await this.withNames([row]))[0]!;
  }

  /** Each row with the names a person needs: the channel, the KPI and the alert's message (F-070). */
  private async withNames(rows: Prisma.NotificationDeliveryGetPayload<{ select: typeof deliverySelect }>[]): Promise<PublicDelivery[]> {
    if (rows.length === 0) return [];
    const ctx = RequestContextStore.require();
    const channelIds = [...new Set(rows.map((r) => r.channelId).filter((id): id is string => id !== null))];
    const alertIds = [...new Set(rows.map((r) => r.alertId))];
    const [channels, alerts] = await Promise.all([
      channelIds.length > 0
        ? this.prisma.notificationChannel.findMany({ where: { id: { in: channelIds }, organizationId: ctx.organizationId }, select: { id: true, name: true } })
        : [],
      this.prisma.alert.findMany({ where: { id: { in: alertIds }, organizationId: ctx.organizationId }, select: { id: true, message: true, kpiId: true } }),
    ]);
    const kpiIds = [...new Set(alerts.map((a) => a.kpiId))];
    const kpis = kpiIds.length > 0
      ? await this.prisma.kPI.findMany({ where: { id: { in: kpiIds }, organizationId: ctx.organizationId }, select: { id: true, name: true } })
      : [];
    const channelName = new Map(channels.map((c) => [c.id, c.name]));
    const alertById = new Map(alerts.map((a) => [a.id, a]));
    const kpiName = new Map(kpis.map((k) => [k.id, k.name]));
    return rows.map((r) => {
      const alert = alertById.get(r.alertId);
      return {
        ...r,
        channelName: r.channelId ? (channelName.get(r.channelId) ?? null) : null,
        kpiName: alert ? (kpiName.get(alert.kpiId) ?? null) : null,
        alertMessage: alert?.message ?? null,
      };
    });
  }
}
