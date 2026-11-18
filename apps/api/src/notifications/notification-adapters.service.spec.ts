import { afterEach, expect, test, vi } from 'vitest';

const posted: Array<{ url: string; body: unknown }> = [];
vi.mock('../outbound/outbound-fetch.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../outbound/outbound-fetch.js')>()),
  outboundFetch: vi.fn(async (url: string, init: { body: string }) => {
    posted.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200 };
  }),
}));

afterEach(() => {
  posted.length = 0;
  vi.unstubAllEnvs();
});

import type { EmailService } from '../email/email.service.js';
import { NotificationAdaptersService } from './notification-adapters.service.js';

test('renders alert title and message as HTML text and preserves the plaintext', async () => {
  const send = vi.fn();
  const adapter = new NotificationAdaptersService({ send } as unknown as EmailService);
  const title = '<img src="x"> & "Revenue"';
  const message = "<a href='x'>Open</a>";
  await adapter.send('EMAIL', { to: 'recipient@example.test' }, {
    alertId: 'alert',
    kpiId: 'kpi',
    severity: 'HIGH',
    title,
    message,
  });
  expect(send).toHaveBeenCalledWith({
    to: ['recipient@example.test'],
    subject: `🔴 ${title}`,
    html: '<p><strong>&lt;img src=&quot;x&quot;&gt; &amp; &quot;Revenue&quot;</strong></p>' +
      '<p>&lt;a href=&#39;x&#39;&gt;Open&lt;/a&gt;</p>',
    text: message,
  });
});

// Plan 6.3: an alert email carries the organisation's name, logo and colour when they are given.
test('an alert email wears the organisation it comes from; the plain text is unchanged', async () => {
  const send = vi.fn();
  const adapter = new NotificationAdaptersService({ send } as unknown as EmailService);
  await adapter.send('EMAIL', { to: 'recipient@example.test' }, {
    alertId: 'alert',
    kpiId: 'kpi',
    severity: 'HIGH',
    title: 'Revenue is low',
    message: 'Revenue fell below 100.',
    brand: { name: 'Helios', logoUrl: 'https://cdn.example.test/logo.png', color: '#7c3aed' },
  });
  const sent = send.mock.calls[0]![0] as { html: string; text: string };
  expect(sent.html).toContain('<p><strong>Revenue is low</strong></p><p>Revenue fell below 100.</p>');
  expect(sent.html).toContain('<img src="https://cdn.example.test/logo.png"');
  expect(sent.html).toContain('#7c3aed');
  expect(sent.text).toBe('Revenue fell below 100.');
});

test('TEAMS posts an Adaptive Card that links to the alert (not the retired MessageCard)', async () => {
  vi.stubEnv('WEB_APP_URL', 'https://app.example.test/');
  const adapter = new NotificationAdaptersService({ send: vi.fn() } as unknown as EmailService);
  await adapter.send('TEAMS', { webhookUrl: 'https://teams.example.test/hook' }, {
    alertId: 'al_9',
    kpiId: 'k1',
    severity: 'MEDIUM',
    title: 'KPI Alert',
    message: 'Revenue dropped below 80',
  });
  expect(posted).toHaveLength(1);
  expect(posted[0]!.url).toBe('https://teams.example.test/hook');
  const json = JSON.stringify(posted[0]!.body);
  expect(json).not.toContain('MessageCard');
  expect(posted[0]!.body).toMatchObject({ type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive' }] });
  expect(json).toContain('https://app.example.test/alerts/al_9');
  expect(json).toContain('Revenue dropped below 80');
});
