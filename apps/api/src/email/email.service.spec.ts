import { afterEach, describe, expect, it, vi } from 'vitest';

const createTransport = vi.fn(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({ createTransport }));

const { EmailService } = await import('./email.service.js');

type TransportOptions = { host: string; port: number; secure: boolean; auth?: { user: string; pass: string } };
const lastOptions = (): TransportOptions =>
  (createTransport.mock.calls.at(-1) as unknown as [TransportOptions])[0];

afterEach(() => {
  vi.unstubAllEnvs();
  createTransport.mockClear();
});

describe('EmailService transport', () => {
  it('talks plain SMTP to the local catcher by default', () => {
    new EmailService();
    expect(lastOptions()).toMatchObject({ host: '127.0.0.1', port: 1025, secure: false });
    expect(lastOptions().auth).toBeUndefined();
  });

  it('uses implicit TLS when SMTP_SECURE=true (e.g. Resend on port 465)', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.resend.com');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_SECURE', 'true');
    vi.stubEnv('SMTP_USER', 'resend');
    vi.stubEnv('SMTP_PASS', 're_test');
    new EmailService();
    expect(lastOptions()).toMatchObject({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: 're_test' },
    });
  });

  it('keeps STARTTLS mode for any other SMTP_SECURE value', () => {
    vi.stubEnv('SMTP_SECURE', 'false');
    new EmailService();
    expect(lastOptions().secure).toBe(false);
  });
});
