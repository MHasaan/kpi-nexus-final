import { Injectable, Logger } from '@nestjs/common';

import { EmailService } from '../email/email.service.js';
import { escapeHtml } from '../email/escape-html.js';
import { webAppUrl } from '../email/web-app-url.js';
import { buildTeamsAdaptiveCard } from '../integrations/providers/teams-format.js';
import { OutboundUrlBlockedError, outboundFetch } from '../outbound/outbound-fetch.js';
import { type EmailBrand, brandedHtml } from '../email/branded-email.js';

export interface NotificationPayload {
  alertId: string;
  kpiId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  title?: string;
  /** The organisation the alert belongs to, for an email's header and colour (plan 6.3). */
  brand?: EmailBrand;
  /** The KPI's name, the rule that raised the alert and what it says to do, and where to open the alert (F-034). */
  kpiName?: string | null;
  ruleName?: string | null;
  runbook?: string | null;
  link?: string | null;
}

/** Thrown by adapters for permanent (4xx-class) failures — not retried. */
export class NonRetryableDeliveryError extends Error {}

const SEVERITY_EMOJI: Record<string, string> = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🔵' };

/**
 * Dispatches a payload to a single channel based on its kind. EMAIL reuses the
 * nodemailer-backed EmailService (Mailhog in dev); SLACK/TEAMS/WEBHOOK POST to
 * their URLs; SMS is a dev stub (logs); IN_APP is a no-op (the
 * NotificationDelivery row itself is the in-app notification, surfaced via SSE).
 *
 * Adapters throw on failure. A 4xx response throws NonRetryableDeliveryError
 * (terminal); 5xx / network throws a plain Error (retryable).
 */
@Injectable()
export class NotificationAdaptersService {
  private readonly logger = new Logger(NotificationAdaptersService.name);

  constructor(private readonly email: EmailService) {}

  async send(
    kind: string,
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<void> {
    switch (kind) {
      case 'IN_APP':
        return; // row is the notification
      case 'EMAIL':
        return this.sendEmail(config, payload);
      case 'SLACK':
        return this.postJson(String(config.webhookUrl ?? ''), {
          text: [
            `${SEVERITY_EMOJI[payload.severity] ?? ''} *${payload.title ?? 'Alert'}*`,
            payload.message,
            ...(payload.runbook ? [`What to do: ${payload.runbook}`] : []),
            ...(payload.link ? [payload.link] : []),
          ].join('\n'),
        });
      case 'TEAMS':
        // An Adaptive Card: Teams retired the legacy MessageCard connector format.
        return this.postJson(
          String(config.webhookUrl ?? ''),
          buildTeamsAdaptiveCard({
            alertId: payload.alertId,
            title: payload.title ?? 'KPI Alert',
            severity: payload.severity,
            message: payload.message,
            alertUrl: webAppUrl(`/alerts/${payload.alertId}`),
          }),
        );
      case 'WEBHOOK':
        return this.postJson(String(config.url ?? ''), { event: 'alert', payload });
      case 'SMS':
        this.logger.log(`[SMS stub] to ${String(config.fromNumber ?? '?')}: ${payload.message}`);
        return;
      default:
        throw new NonRetryableDeliveryError(`Unknown channel kind: ${kind}`);
    }
  }

  private async sendEmail(
    config: Record<string, unknown>,
    payload: NotificationPayload,
  ): Promise<void> {
    const to = (config.fromAddress as string) ?? (config.to as string);
    // For alerts the recipient list comes from the escalation level's users;
    // when a channel has no explicit address we fall back to a configured one.
    const recipients = (config.recipients as string[]) ?? (to ? [to] : []);
    if (recipients.length === 0) {
      // Nothing to send to — treat as a no-op success rather than a failure.
      this.logger.debug('EMAIL channel has no recipients configured — skipping');
      return;
    }
    // What the person needs to act (F-034): the KPI in the title, the rule, what to do, and the way in.
    const title = payload.title ?? 'KPI Alert';
    const paragraphs = [`<p><strong>${escapeHtml(title)}</strong></p><p>${escapeHtml(payload.message)}</p>`];
    if (payload.ruleName) paragraphs.push(`<p>Rule: ${escapeHtml(payload.ruleName)}</p>`);
    if (payload.runbook) paragraphs.push(`<p><strong>What to do:</strong> ${escapeHtml(payload.runbook)}</p>`);
    if (payload.link) paragraphs.push(`<p><a href="${escapeHtml(payload.link)}">Open the alert</a></p>`);
    const body = paragraphs.join('');
    const text = [
      payload.message,
      ...(payload.ruleName ? [`Rule: ${payload.ruleName}`] : []),
      ...(payload.runbook ? [`What to do: ${payload.runbook}`] : []),
      ...(payload.link ? [`Open the alert: ${payload.link}`] : []),
    ].join('\n');
    await this.email.send({
      to: recipients,
      subject: `${SEVERITY_EMOJI[payload.severity] ?? ''} ${title}${payload.ruleName ? ` — ${payload.ruleName}` : ''}`,
      html: payload.brand ? brandedHtml(payload.brand, body) : body,
      text,
    });
  }

  private async postJson(url: string, body: unknown): Promise<void> {
    if (!url) throw new NonRetryableDeliveryError('Channel missing target URL');
    let res: Awaited<ReturnType<typeof outboundFetch>>;
    try {
      res = await outboundFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // An internal/forbidden target will never succeed — don't retry it.
      if (err instanceof OutboundUrlBlockedError) throw new NonRetryableDeliveryError(err.message);
      // Network error — retryable.
      throw new Error(`Delivery network error: ${String(err)}`, { cause: err });
    }
    if (res.ok) return;
    if (res.status >= 400 && res.status < 500) {
      throw new NonRetryableDeliveryError(`Delivery rejected with ${res.status}`);
    }
    throw new Error(`Delivery failed with ${res.status}`);
  }
}
