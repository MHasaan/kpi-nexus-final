import { Injectable, Logger } from '@nestjs/common';

import { EmailService } from '../email/email.service.js';

export interface NotificationPayload {
  alertId: string;
  kpiId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  message: string;
  title?: string;
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
          text: `${SEVERITY_EMOJI[payload.severity] ?? ''} *${payload.title ?? 'Alert'}*\n${payload.message}`,
        });
      case 'TEAMS':
        return this.postJson(String(config.webhookUrl ?? ''), {
          '@type': 'MessageCard',
          themeColor: payload.severity === 'HIGH' ? 'D00000' : 'FFC400',
          title: payload.title ?? 'KPI Alert',
          text: payload.message,
        });
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
    await this.email.send({
      to: recipients,
      subject: `${SEVERITY_EMOJI[payload.severity] ?? ''} ${payload.title ?? 'KPI Alert'}`,
      html: `<p><strong>${payload.title ?? 'KPI Alert'}</strong></p><p>${payload.message}</p>`,
      text: payload.message,
    });
  }

  private async postJson(url: string, body: unknown): Promise<void> {
    if (!url) throw new NonRetryableDeliveryError('Channel missing target URL');
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // Network error — retryable.
      throw new Error(`Delivery network error: ${String(err)}`);
    }
    if (res.ok) return;
    if (res.status >= 400 && res.status < 500) {
      throw new NonRetryableDeliveryError(`Delivery rejected with ${res.status}`);
    }
    throw new Error(`Delivery failed with ${res.status}`);
  }
}
