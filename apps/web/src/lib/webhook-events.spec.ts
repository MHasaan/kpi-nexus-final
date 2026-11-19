import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

import { WEBHOOK_EVENT_LABELS, webhookEventLabel } from './webhook-events';

describe('webhookEventLabel', () => {
  test('says an event in words, and an unknown one by its code', () => {
    expect(webhookEventLabel('alert_triggered')).toBe('An alert fires');
    expect(webhookEventLabel('something_new')).toBe('something_new');
  });

  test('has words for every event the API can send', () => {
    const catalog = readFileSync(new URL('../../../api/src/webhooks/webhook-events.ts', import.meta.url), 'utf8');
    const events = [...catalog.matchAll(/^\s+'([a-z_]+)',/gm)].map((m) => m[1]!);
    expect(events.length).toBeGreaterThan(10);
    expect(events.filter((e) => !(e in WEBHOOK_EVENT_LABELS))).toEqual([]);
  });
});
