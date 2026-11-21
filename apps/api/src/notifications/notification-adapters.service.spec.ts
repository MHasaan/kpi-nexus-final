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

// Manual QA (2026-11-19, F-034 / F-035): an alert email was headed "KPI Alert" and held only the message. No KPI
// or severity in the subject, no rule, no "what to do", and no way into the app.
test('an alert email says which KPI and rule, what to do, and where to open it', async () => {
  const send = vi.fn();
  const adapter = new NotificationAdaptersService({ send } as unknown as EmailService);
  await adapter.send('EMAIL', { recipients: ['olivia@example.test'] }, {
    alertId: 'alert',
    kpiId: 'kpi',
    severity: 'HIGH',
    title: 'High alert: Monthly Recurring Revenue',
    message: 'Monthly Recurring Revenue: Value 221,000 is below 230,000',
    kpiName: 'Monthly Recurring Revenue',
    ruleName: 'MRR below 230k floor',
    runbook: 'Check pipeline with Sales, then brief the CFO',
    link: 'https://app.example.test/alerts/alert',
  });
  const sent = send.mock.calls[0]![0] as { subject: string; html: string; text: string };
  expect(sent.subject).toBe('🔴 High alert: Monthly Recurring Revenue — MRR below 230k floor');
  expect(sent.html).toContain('<p><strong>High alert: Monthly Recurring Revenue</strong></p><p>Monthly Recurring Revenue: Value 221,000 is below 230,000</p>');
  expect(sent.html).toContain('<p>Rule: MRR below 230k floor</p>');
  expect(sent.html).toContain('<p><strong>What to do:</strong> Check pipeline with Sales, then brief the CFO</p>');
  expect(sent.html).toContain('<p><a href="https://app.example.test/alerts/alert">Open the alert</a></p>');
  expect(sent.text).toBe(
    'Monthly Recurring Revenue: Value 221,000 is below 230,000\nRule: MRR below 230k floor\nWhat to do: Check pipeline with Sales, then brief the CFO\nOpen the alert: https://app.example.test/alerts/alert',
  );
});

test('a Slack message carries what to do and the link as well', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  const adapter = new NotificationAdaptersService({ send: vi.fn() } as unknown as EmailService);
  vi.spyOn(adapter as unknown as { postJson: (url: string, body: unknown) => Promise<void> }, 'postJson').mockResolvedValue(undefined);
  await adapter.send('SLACK', { webhookUrl: 'https://hooks.slack.test/x' }, {
    alertId: 'alert',
    kpiId: 'kpi',
    severity: 'MEDIUM',
    title: 'Medium alert: Churn',
    message: 'Churn: Value 5.1 is above 4',
    runbook: 'Call the top three accounts',
    link: 'https://app.example.test/alerts/alert',
  });
  const body = (adapter as unknown as { postJson: ReturnType<typeof vi.fn> }).postJson.mock.calls[0]![1] as { text: string };
  expect(body.text).toBe('🟡 *Medium alert: Churn*\nChurn: Value 5.1 is above 4\nWhat to do: Call the top three accounts\nhttps://app.example.test/alerts/alert');
  expect(fetchImpl).not.toHaveBeenCalled();
});
