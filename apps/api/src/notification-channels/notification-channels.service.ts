import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { NotificationAdaptersService } from '../notifications/notification-adapters.service.js';
import { decryptConfig, encryptConfig } from './notification-crypto.js';

// Public shape — NEVER includes the encrypted `config` blob.
const publicSelect = {
  id: true,
  organizationId: true,
  name: true,
  kind: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NotificationChannelSelect;

export type PublicChannel = Prisma.NotificationChannelGetPayload<{ select: typeof publicSelect }>;

@Injectable()
export class NotificationChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adapters: NotificationAdaptersService,
  ) {}

  async list(): Promise<PublicChannel[]> {
    const ctx = RequestContextStore.require();
    return this.prisma.notificationChannel.findMany({
      where: { organizationId: ctx.organizationId },
      select: publicSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async create(input: {
    name: string;
    kind: string;
    config: Record<string, unknown>;
  }): Promise<PublicChannel> {
    const ctx = RequestContextStore.require();
    const channel = await this.prisma.notificationChannel.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        kind: input.kind as Prisma.NotificationChannelCreateInput['kind'],
        config: encryptConfig(input.config),
      },
      select: publicSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'NotificationChannel',
      entityId: channel.id,
      metadata: { name: channel.name, kind: channel.kind },
    });
    return channel;
  }

  async update(
    id: string,
    patch: { name?: string; isActive?: boolean; config?: Record<string, unknown> },
  ): Promise<PublicChannel> {
    await this.requireInTenant(id);
    const channel = await this.prisma.notificationChannel.update({
      where: { id },
      data: {
        name: patch.name,
        isActive: patch.isActive,
        ...(patch.config !== undefined ? { config: encryptConfig(patch.config) } : {}),
      },
      select: publicSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'NotificationChannel', entityId: id });
    return channel;
  }

  async remove(id: string): Promise<void> {
    await this.requireInTenant(id);
    await this.prisma.notificationChannel.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'NotificationChannel', entityId: id });
  }

  /** Send a synthetic test message through the channel adapter. */
  async test(id: string): Promise<void> {
    const channel = await this.requireInTenant(id);
    const config = safeDecrypt(channel.config as string);
    await this.adapters.send(channel.kind, config, {
      alertId: 'test',
      kpiId: 'test',
      severity: 'LOW',
      message: 'This is a test notification from KPI Nexus.',
      title: 'Test notification',
    });
  }

  private async requireInTenant(id: string): Promise<{ kind: string; config: unknown }> {
    const ctx = RequestContextStore.require();
    const row = await this.prisma.notificationChannel.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true, kind: true, config: true },
    });
    if (!row) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification channel not found' });
    }
    return { kind: row.kind, config: row.config };
  }
}

function safeDecrypt(encrypted: string): Record<string, unknown> {
  try {
    return decryptConfig(encrypted);
  } catch {
    return {};
  }
}
