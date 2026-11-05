import { expect, test, vi } from 'vitest';

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
