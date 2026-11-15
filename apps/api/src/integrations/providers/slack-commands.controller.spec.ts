/**
 * POST /integrations/slack/commands: public, so every request must carry a
 * valid Slack signature over the raw form body; the form fields are read from
 * those exact bytes.
 */
import { createHmac } from 'node:crypto';

import { UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JiraService } from './jira.service.js';
import { IntegrationProvidersController } from './integration-providers.controller.js';
import type { SlackCommandService } from './slack-command.service.js';
import type { SlackService } from './slack.service.js';

const SECRET = 'slack-signing-secret-for-tests';
const sign = (raw: string, ts: string, secret = SECRET) => `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}`;
const raw = 'command=%2Fkpi&text=revenue+growth&team_id=T1&user_id=U1&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands%2FT1%2F1%2Fabc';

describe('POST /integrations/slack/commands', () => {
  const handle = vi.fn(async () => ({ response_type: 'ephemeral' as const, text: 'ok' }));
  const controller = new IntegrationProvidersController(
    {} as unknown as SlackService,
    {} as unknown as JiraService,
    { handle } as unknown as SlackCommandService,
  );
  const now = () => String(Math.floor(Date.now() / 1000));
  beforeEach(() => vi.stubEnv('SLACK_SIGNING_SECRET', SECRET));
  afterEach(() => {
    vi.unstubAllEnvs();
    handle.mockClear();
  });

  it('a signed request runs the command with the fields from the raw body', async () => {
    const ts = now();
    await expect(controller.slackCommand({ rawBody: Buffer.from(raw) }, sign(raw, ts), ts)).resolves.toEqual({ response_type: 'ephemeral', text: 'ok' });
    expect(handle).toHaveBeenCalledWith({ teamId: 'T1', slackUserId: 'U1', text: 'revenue growth', responseUrl: 'https://hooks.slack.com/commands/T1/1/abc' });
  });

  it('a missing, forged or stale signature is 401 and runs nothing', async () => {
    const ts = now();
    await expect(controller.slackCommand({ rawBody: Buffer.from(raw) }, undefined, ts)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.slackCommand({ rawBody: Buffer.from(raw) }, sign(raw, ts, 'wrong'), ts)).rejects.toBeInstanceOf(UnauthorizedException);
    const old = String(Math.floor(Date.now() / 1000) - 600);
    await expect(controller.slackCommand({ rawBody: Buffer.from(raw) }, sign(raw, old), old)).rejects.toBeInstanceOf(UnauthorizedException);
    vi.stubEnv('SLACK_SIGNING_SECRET', '');
    await expect(controller.slackCommand({ rawBody: Buffer.from(raw) }, sign(raw, ts), ts)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handle).not.toHaveBeenCalled();
  });
});
