/**
 * PasswordResetService.request (audit BE-007): the reset link goes to the
 * user by email and the token never reaches the application log.
 */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { RefreshTokenService } from '../auth/services/refresh-token.service.js';
import type { EmailService } from '../email/email.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PasswordResetService } from './password-reset.service.js';

function make(user: { id: string; organizationId: string; email: string } | null) {
  const prisma = {
    user: { findFirst: vi.fn(async () => user) },
    passwordResetToken: { updateMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({})) },
  };
  const email = { send: vi.fn(async (_msg: { to: string; subject: string; html: string; text?: string }) => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    {} as unknown as RefreshTokenService,
    email as unknown as EmailService,
  );
  return { service, email, prisma };
}

describe('PasswordResetService.request', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
        logged.push(String(args[0]));
      });
    }
    vi.stubEnv('WEB_APP_URL', 'https://app.example.test');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test('emails the user a /reset-password link on the web app', async () => {
    const { service, email } = make({ id: 'u1', organizationId: 'o1', email: 'ada@example.test' });
    await service.request('ada@example.test');

    expect(email.send).toHaveBeenCalledOnce();
    const msg = email.send.mock.calls[0]![0];
    expect(msg.to).toBe('ada@example.test');
    expect(msg.html).toMatch(/https:\/\/app\.example\.test\/reset-password\?token=[A-Za-z0-9_-]{20,}/);
  });

  test('never writes the reset token (or link) to the log', async () => {
    const { service, email } = make({ id: 'u1', organizationId: 'o1', email: 'ada@example.test' });
    await service.request('ada@example.test');

    const html = email.send.mock.calls[0]![0].html;
    const token = html.match(/token=([A-Za-z0-9_-]+)/)![1]!;
    expect(logged.join('\n')).not.toContain(token);
    expect(logged.join('\n')).not.toContain('/reset-password');
  });

  test('unknown email → no email sent, nothing revealed', async () => {
    const { service, email } = make(null);
    await expect(service.request('nobody@example.test')).resolves.toBeUndefined();
    expect(email.send).not.toHaveBeenCalled();
  });

  test('email delivery failure is swallowed (caller still gets 202) and logged without the token', async () => {
    const { service, email } = make({ id: 'u1', organizationId: 'o1', email: 'ada@example.test' });
    email.send.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(service.request('ada@example.test')).resolves.toBeUndefined();
    expect(logged.some((l) => /reset email/i.test(l))).toBe(true);
    expect(logged.join('\n')).not.toMatch(/token=/);
  });
});
