/**
 * Slack interactive callback verification (audit BE-015).
 *
 * The endpoint is @Public and acknowledges alerts, so every request must carry
 * a valid Slack signature computed over the RAW request body. Previously the
 * check only ran when the secret AND both headers were present (a request that
 * omitted the headers skipped it), and it hashed a re-serialised body that
 * never matches what Slack signed.
 */
import { createHmac } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { JiraService } from './jira.service.js';
import { IntegrationProvidersController } from './integration-providers.controller.js';
import type { SlackService } from './slack.service.js';

const SECRET = 'slack-signing-secret-for-tests';

function sign(raw: string, ts: string, secret = SECRET) {
  return `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`;
}

/** What Slack actually sends: urlencoded `payload=<json>`. */
function slackRequest(payload: object) {
  const raw = `payload=${encodeURIComponent(JSON.stringify(payload))}`.replace(/%20/g, '+');
  type Body = Parameters<IntegrationProvidersController['slackInteractive']>[1];
  return { raw, req: { rawBody: Buffer.from(raw) }, body: { payload: JSON.stringify(payload) } as Body };
}

describe('POST /integrations/slack/interactive signature verification', () => {
  const handleInteractive = vi.fn(async () => ({ handled: true }));
  const controller = new IntegrationProvidersController(
    { handleInteractive } as unknown as SlackService,
    {} as unknown as JiraService,
  );
  const payload = { team: { id: 'T123' }, actions: [{ action_id: 'acknowledge_alert', value: 'alert_1' }] };
  const now = () => String(Math.floor(Date.now() / 1000));

  beforeEach(() => {
    handleInteractive.mockClear();
    vi.stubEnv('SLACK_SIGNING_SECRET', SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('valid signature over the raw form body → handled', async () => {
    const { raw, req, body } = slackRequest(payload);
    const ts = now();
    await expect(controller.slackInteractive(req, body, sign(raw, ts), ts)).resolves.toEqual({ handled: true });
    expect(handleInteractive).toHaveBeenCalledOnce();
  });

  test.each([
    ['missing signature header', (raw: string, ts: string) => [undefined, ts]],
    ['missing timestamp header', (raw: string, ts: string) => [sign(raw, ts), undefined]],
    ['wrong secret', (raw: string, ts: string) => [sign(raw, ts, 'other-secret'), ts]],
    ['tampered body', (raw: string, ts: string) => [sign(`${raw}x`, ts), ts]],
    ['stale timestamp (10 min old)', (raw: string) => {
      const old = String(Math.floor(Date.now() / 1000) - 600);
      return [sign(raw, old), old];
    }],
  ])('%s → 401, alert not acknowledged', async (_label, headers) => {
    const { raw, req, body } = slackRequest(payload);
    const [sig, ts] = headers(raw, now());
    await expect(controller.slackInteractive(req, body, sig, ts)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handleInteractive).not.toHaveBeenCalled();
  });

  test('no SLACK_SIGNING_SECRET configured → fails closed (401)', async () => {
    vi.stubEnv('SLACK_SIGNING_SECRET', '');
    const { raw, req, body } = slackRequest(payload);
    const ts = now();
    await expect(controller.slackInteractive(req, body, sign(raw, ts), ts)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handleInteractive).not.toHaveBeenCalled();
  });

  test('raw body unavailable → 401 (never verify a re-serialised body)', async () => {
    const { raw, body } = slackRequest(payload);
    const ts = now();
    await expect(controller.slackInteractive({}, body, sign(raw, ts), ts)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handleInteractive).not.toHaveBeenCalled();
  });
});
