import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service.js';
import { decryptConfig } from '../notification-channels/notification-crypto.js';
import {
  NotificationAdaptersService,
  NonRetryableDeliveryError,
  type NotificationPayload,
} from './notification-adapters.service.js';

export const NOTIFICATION_RETRY_QUEUE = 'notification-retry';

export interface NotificationRetryJobData {
  deliveryId: string;
  organizationId: string;
}

/** Retry backoff in ms by attempt number already made (1→2nd attempt, etc.). */
const RETRY_BACKOFF_MS = [30_000, 5 * 60_000, 30 * 60_000];
const MAX_ATTEMPTS = 1 + RETRY_BACKOFF_MS.length; // initial + 3 retries

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: NotificationAdaptersService,
    @InjectQueue(NOTIFICATION_RETRY_QUEUE) private readonly retryQueue: Queue<NotificationRetryJobData>,
  ) {}

  /**
   * Create + attempt a delivery for each channel (plus an IN_APP row when
   * `includeInApp`). Returns the created delivery ids.
   */
  async dispatch(params: {
    organizationId: string;
    alertId: string;
    channelIds: string[];
    targetUserId?: string | null;
    includeInApp?: boolean;
  }): Promise<string[]> {
    const ids: string[] = [];

    if (params.includeInApp) {
      const row = await this.prisma.notificationDelivery.create({
        data: {
          organizationId: params.organizationId,
          alertId: params.alertId,
          channelId: null,
          targetUserId: params.targetUserId ?? null,
          status: 'PENDING',
        },
        select: { id: true },
      });
      ids.push(row.id);
      await this.attemptDelivery(row.id);
    }

    for (const channelId of params.channelIds) {
      const row = await this.prisma.notificationDelivery.create({
        data: {
          organizationId: params.organizationId,
          alertId: params.alertId,
          channelId,
          targetUserId: params.targetUserId ?? null,
          status: 'PENDING',
        },
        select: { id: true },
      });
      ids.push(row.id);
      await this.attemptDelivery(row.id);
    }
    return ids;
  }

  /**
   * Attempt (or re-attempt) a single delivery. Marks SENT on success; on a
   * retryable failure marks FAILED and schedules the next attempt with backoff
   * until MAX_ATTEMPTS; non-retryable failures go terminal immediately.
   */
  async attemptDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        organizationId: true,
        alertId: true,
        channelId: true,
        attempts: true,
        status: true,
      },
    });
    if (!delivery) return;
    // Refuse to re-send something already terminal-sent (idempotent on retry).
    if (delivery.status === 'SENT') return;

    const alert = await this.prisma.alert.findUnique({
      where: { id: delivery.alertId },
      select: { id: true, kpiId: true, severity: true, message: true },
    });
    if (!alert) return;

    const payload: NotificationPayload = {
      alertId: alert.id,
      kpiId: alert.kpiId,
      severity: alert.severity,
      message: alert.message,
      title: 'KPI Alert',
    };

    let kind = 'IN_APP';
    let config: Record<string, unknown> = {};
    if (delivery.channelId) {
      const channel = await this.prisma.notificationChannel.findUnique({
        where: { id: delivery.channelId },
        select: { kind: true, config: true, isActive: true },
      });
      if (!channel || !channel.isActive) {
        await this.markFailed(deliveryId, 'Channel missing or inactive', delivery.attempts + 1);
        return;
      }
      kind = channel.kind;
      try {
        config = decryptConfig(channel.config as string);
      } catch {
        config = {};
      }
    }

    const attemptNo = delivery.attempts + 1;
    try {
      await this.adapters.send(kind, config, payload);
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: { status: 'SENT', sentAt: new Date(), attempts: attemptNo },
      });
    } catch (err) {
      const terminal =
        err instanceof NonRetryableDeliveryError || attemptNo >= MAX_ATTEMPTS;
      const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
      await this.markFailed(deliveryId, message, attemptNo);
      if (!terminal) {
        const delay = RETRY_BACKOFF_MS[attemptNo - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]!;
        await this.scheduleRetry(deliveryId, delivery.organizationId, delay);
      } else {
        this.logger.warn(`Delivery ${deliveryId} terminal FAILED after ${attemptNo} attempt(s): ${message}`);
      }
    }
  }

  private async markFailed(deliveryId: string, error: string, attempts: number): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', error, attempts },
    });
  }

  private async scheduleRetry(deliveryId: string, organizationId: string, delay: number): Promise<void> {
    try {
      await this.retryQueue.add(
        'retry',
        { deliveryId, organizationId },
        { delay, jobId: `retry-${deliveryId}-${Date.now()}`, removeOnComplete: 1000, removeOnFail: 5000 },
      );
    } catch (err) {
      this.logger.warn(`Failed to schedule retry for ${deliveryId}: ${String(err)}`);
    }
  }
}
