import { describe, expect, it } from 'vitest';

import { CreateWebhookDtoSchema } from './webhooks.controller.js';

const base = { name: 'Hook', url: 'https://example.com/hook' };

describe('CreateWebhookDtoSchema events (BE-023)', () => {
  it('rejects an event outside WEBHOOK_EVENT_CATALOG', () => {
    expect(CreateWebhookDtoSchema.safeParse({ ...base, events: ['nope.nope'] }).success).toBe(false);
    expect(CreateWebhookDtoSchema.safeParse({ ...base, events: ['alert_triggered', 'nope'] }).success).toBe(false);
  });

  it('accepts catalog events', () => {
    expect(CreateWebhookDtoSchema.safeParse({ ...base, events: ['alert_triggered', 'task_created'] }).success).toBe(true);
  });
});
