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
  status: true,
  attempts: true,
  error: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.NotificationDeliverySelect;

export type PublicDelivery = Prisma.NotificationDeliveryGetPayload<{ select: typeof deliverySelect }>;

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
  }): Promise<PublicDelivery[]> {
    const ctx = RequestContextStore.require();
    const where: Prisma.NotificationDeliveryWhereInput = { organizationId: ctx.organizationId };
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = filter.from;
      if (filter.to) where.createdAt.lte = filter.to;
    }
    return this.prisma.notificationDelivery.findMany({
      where,
      select: deliverySelect,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(filter.limit ?? 100, 500),
    });
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
    return this.prisma.notificationDelivery.findUniqueOrThrow({
      where: { id },
      select: deliverySelect,
    });
  }
}
