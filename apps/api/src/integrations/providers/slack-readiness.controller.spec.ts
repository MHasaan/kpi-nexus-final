/**
 * Manual QA (2026-11-19, F-047): Slack → Connect showed "Waiting for Slack" and two request addresses, and said
 * the signing secret "is set on the server by whoever runs it" — without saying it was NOT set on this server,
 * so the connection could never complete and nothing said why. The page can now ask whether the server is ready.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { REQUIRE_PERMISSIONS_KEY } from '../../rbac/decorators/require-permissions.decorator.js';
import { IntegrationProvidersController } from './integration-providers.controller.js';

const controller = () => new IntegrationProvidersController({} as never, {} as never, {} as never);

describe('GET /integrations/slack/readiness', () => {
  const before = process.env.SLACK_SIGNING_SECRET;
  afterEach(() => {
    if (before === undefined) delete process.env.SLACK_SIGNING_SECRET;
    else process.env.SLACK_SIGNING_SECRET = before;
  });

  it('says the signing secret is not set when the server has none', () => {
    delete process.env.SLACK_SIGNING_SECRET;
    expect(controller().slackReadiness()).toEqual({ signingSecretSet: false });
  });

  it('says it is set when the server has one, without giving it away', () => {
    process.env.SLACK_SIGNING_SECRET = 'shh';
    expect(controller().slackReadiness()).toEqual({ signingSecretSet: true });
  });

  it('is for people who manage integrations', () => {
    expect(Reflect.getMetadata(REQUIRE_PERMISSIONS_KEY, IntegrationProvidersController.prototype.slackReadiness)).toEqual(['INTEGRATIONS_MANAGE']);
  });
});
