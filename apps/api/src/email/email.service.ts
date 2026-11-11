import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Thin wrapper around nodemailer.
 * In dev, connects to Mailhog (SMTP_HOST/SMTP_PORT, no auth).
 * In production, configure SMTP_USER/SMTP_PASS for auth and SMTP_SECURE for
 * implicit TLS (see infra/fly/README.md).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    this.from = process.env.SMTP_FROM ?? 'noreply@kpi-nexus.local';
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? '127.0.0.1',
      port: Number(process.env.SMTP_PORT ?? 1025),
      // No auth or TLS in dev (Mailhog). SMTP_SECURE=true opens the connection
      // with TLS (port 465); otherwise nodemailer upgrades with STARTTLS when the
      // server offers it (port 587). Production also sets SMTP_USER/SMTP_PASS.
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    });
  }

  async send(opts: SendEmailOptions): Promise<void> {
    const recipients = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to;
    this.logger.log(`Sending email to ${recipients} — subject: ${opts.subject}`);

    await this.transporter.sendMail({
      from: this.from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });

    this.logger.log(`Email delivered to ${recipients}`);
  }
}
