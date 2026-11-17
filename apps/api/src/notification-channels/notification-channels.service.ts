import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@kpi-nexus/db';

import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertOutboundUrl } from '../outbound/assert-outbound-url.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { NotificationAdaptersService } from '../notifications/notification-adapters.service.js';
import { channelCannotDeliver, channelConfigProblem, channelTarget } from './channel-config.js';
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

const storedSelect = { ...publicSelect, config: true } satisfies Prisma.NotificationChannelSelect;
type StoredChannel = Prisma.NotificationChannelGetPayload<{ select: typeof storedSelect }>;

export type PublicChannel = Prisma.NotificationChannelGetPayload<{ select: typeof publicSelect }> & {
  /** Where it sends, for display: email addresses, or only the host of a webhook URL. */
  target: string | null;
};

/** The outcome of "Send test": whether a message really left, and if not, why. */
export type ChannelTestResult = { sent: true } | { sent: false; error: string };

/** Strip the encrypted config, keeping only a description of where the channel sends. */
function toPublic({ config, ...channel }: StoredChannel): PublicChannel {
  return { ...channel, target: channelTarget(channel.kind, safeDecrypt(config as string)) };
}

@Injectable()
export class NotificationChannelsService {
  private readonly logger = new Logger(NotificationChannelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly adapters: NotificationAdaptersService,
  ) {}

  async list(): Promise<PublicChannel[]> {
    const ctx = RequestContextStore.require();
    const rows = await this.prisma.notificationChannel.findMany({
      where: { organizationId: ctx.organizationId },
      select: storedSelect,
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map(toPublic);
  }

  async create(input: {
    name: string;
    kind: string;
    config: Record<string, unknown>;
  }): Promise<PublicChannel> {
    assertChannelConfig(input.kind, input.config);
    await assertChannelTargets(input.config);
    const ctx = RequestContextStore.require();
    const channel = await this.prisma.notificationChannel.create({
      data: {
        organizationId: ctx.organizationId,
        name: input.name,
        kind: input.kind as Prisma.NotificationChannelCreateInput['kind'],
        config: encryptConfig(input.config),
      },
      select: storedSelect,
    });
    await this.audit.record({
      action: 'CREATE',
      entityType: 'NotificationChannel',
      entityId: channel.id,
      metadata: { name: channel.name, kind: channel.kind },
    });
    return toPublic(channel);
  }

  async update(
    id: string,
    patch: { name?: string; isActive?: boolean; config?: Record<string, unknown> },
  ): Promise<PublicChannel> {
    const existing = await this.requireInTenant(id);
    if (patch.config !== undefined) {
      assertChannelConfig(existing.kind, patch.config);
      await assertChannelTargets(patch.config);
    }
    const channel = await this.prisma.notificationChannel.update({
      where: { id },
      data: {
        name: patch.name,
        isActive: patch.isActive,
        ...(patch.config !== undefined ? { config: encryptConfig(patch.config) } : {}),
      },
      select: storedSelect,
    });
    await this.audit.record({ action: 'UPDATE', entityType: 'NotificationChannel', entityId: id });
    return toPublic(channel);
  }

  async remove(id: string): Promise<void> {
    await this.requireInTenant(id);
    await this.prisma.notificationChannel.delete({ where: { id } });
    await this.audit.record({ action: 'DELETE', entityType: 'NotificationChannel', entityId: id });
  }

  /**
   * Send a test message through the channel and say what happened. A failure
   * is an answer, not an exception: the person pressing "Send test" needs to
   * read why it failed, and a 500 told them nothing. Nor is "nothing to send
   * to" a success — an email channel with no recipients, and SMS (a stub with
   * no provider behind it), used to report "sent".
   */
  async test(id: string): Promise<ChannelTestResult> {
    const channel = await this.requireInTenant(id);
    const config = safeDecrypt(channel.config as string);
    const cannot = channelCannotDeliver(channel.kind, config);
    if (cannot) return { sent: false, error: cannot };
    try {
      await this.adapters.send(channel.kind, config, {
        alertId: 'test',
        kpiId: 'test',
        severity: 'LOW',
        message: 'This is a test notification from KPI Nexus.',
        title: 'Test notification',
      });
      return { sent: true };
    } catch (err) {
      this.logger.warn(`Channel test failed for ${id} (${channel.kind}): ${String(err)}`);
      return { sent: false, error: err instanceof Error && err.message ? err.message : 'The test message could not be delivered.' };
    }
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

/** Refuse a config the channel could never deliver with. */
function assertChannelConfig(kind: string, config: Record<string, unknown>): void {
  const problem = channelConfigProblem(kind, config);
  if (problem) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: problem });
}

/** WEBHOOK channels post to config.url; SLACK / TEAMS to config.webhookUrl. */
async function assertChannelTargets(config: Record<string, unknown>): Promise<void> {
  await assertOutboundUrl(config.url, 'config.url');
  await assertOutboundUrl(config.webhookUrl, 'config.webhookUrl');
}
