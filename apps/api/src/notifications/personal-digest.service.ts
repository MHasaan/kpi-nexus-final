import { Injectable, Logger } from '@nestjs/common';
import { isTimeZone } from '@kpi-nexus/contracts';

import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RequestContextStore } from '../tenancy/request-context.js';
import { readNotificationSettings, wallClock } from './notification-preferences.js';

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The most alerts one digest email lists; the rest are counted. */
const MAX_LISTED = 50;

/** The hour a digest goes out, on each person's own clock. */
export const DIGEST_HOUR = 7;

/**
 * Sends what was kept for people who chose a digest: one email each, with
 * every alert notification kept for them since the last one.
 *
 * The job runs every hour; a person's digest goes out on the run that falls at
 * 07:00 on their own clock — their timezone, else their organisation's (since
 * 2026-11-20; it was 07:00 UTC for everyone):
 *
 *  - DAILY: every day at 07:00 their time.
 *  - WEEKLY: on Mondays at 07:00 their time.
 *  - Someone who has since turned the digest off gets what was kept on the next run.
 *
 * Runs with no request context, across organisations.
 */
@Injectable()
export class PersonalDigestService {
  private readonly logger = new Logger(PersonalDigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async sendDue(now: Date = new Date()): Promise<{ people: number; notifications: number }> {
    return RequestContextStore.runWithBypass('personal-digest', async () => {
      const kept = await this.prisma.notificationDelivery.findMany({
        where: { status: 'PENDING', held: 'DIGEST' },
        select: { id: true, alertId: true, targetUserId: true },
        orderBy: { createdAt: 'asc' },
      });
      const byPerson = new Map<string, Array<{ id: string; alertId: string }>>();
      for (const row of kept) {
        if (!row.targetUserId) continue;
        byPerson.set(row.targetUserId, [...(byPerson.get(row.targetUserId) ?? []), { id: row.id, alertId: row.alertId }]);
      }

      let people = 0;
      let notifications = 0;
      const orgZones = new Map<string, string | null>();
      for (const [userId, rows] of byPerson) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, status: true, notificationSettings: true, timezone: true, organizationId: true },
        });
        if (!user || user.status !== 'ACTIVE') continue;
        const mode = readNotificationSettings(user.notificationSettings).digestMode;
        if (mode !== 'OFF') {
          const local = wallClock(now, await this.zoneOf(user, orgZones));
          if (local.hour !== DIGEST_HOUR) continue;
          if (mode === 'WEEKLY' && local.weekday !== 1) continue;
        }

        const alerts = await this.prisma.alert.findMany({
          where: { id: { in: [...new Set(rows.map((r) => r.alertId))] } },
          select: { id: true, severity: true, message: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        try {
          await this.email.send(this.compose(user.email, alerts, rows.length));
          await this.prisma.notificationDelivery.updateMany({
            where: { id: { in: rows.map((r) => r.id) } },
            data: { status: 'SENT', sentAt: now, held: null },
          });
          people += 1;
          notifications += rows.length;
        } catch (err) {
          // Kept for the next run: a digest that could not be sent is not lost.
          this.logger.warn(`Digest for ${userId} could not be sent: ${String(err)}`);
        }
      }
      return { people, notifications };
    });
  }

  /** The person's own clock: their timezone, else their organisation's, else UTC. */
  private async zoneOf(
    user: { timezone: string | null; organizationId: string },
    orgZones: Map<string, string | null>,
  ): Promise<string> {
    if (!orgZones.has(user.organizationId)) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId }, select: { timezone: true } });
      orgZones.set(user.organizationId, org?.timezone ?? null);
    }
    return [user.timezone, orgZones.get(user.organizationId)].find((zone): zone is string => typeof zone === 'string' && isTimeZone(zone)) ?? 'UTC';
  }

  private compose(
    to: string,
    alerts: Array<{ severity: string; message: string; createdAt: Date }>,
    count: number,
  ): { to: string; subject: string; text: string; html: string } {
    const listed = alerts.slice(0, MAX_LISTED);
    const more = alerts.length - listed.length;
    const line = (a: { severity: string; message: string; createdAt: Date }) => `[${a.severity}] ${a.message} (${a.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)`;
    const text = [
      `${count} KPI alert ${count === 1 ? 'notification was' : 'notifications were'} kept for your digest:`,
      '',
      ...listed.map((a) => `- ${line(a)}`),
      ...(more > 0 ? [`…and ${more} more.`] : []),
      '',
      'You receive this because you chose a digest in your notification preferences.',
    ].join('\n');
    const html = [
      `<p>${count} KPI alert ${count === 1 ? 'notification was' : 'notifications were'} kept for your digest:</p>`,
      `<ul>${listed.map((a) => `<li>${escapeHtml(line(a))}</li>`).join('')}</ul>`,
      more > 0 ? `<p>…and ${more} more.</p>` : '',
      '<p>You receive this because you chose a digest in your notification preferences.</p>',
    ].join('');
    return { to, subject: `${count} KPI ${count === 1 ? 'alert' : 'alerts'}`, text, html };
  }
}
